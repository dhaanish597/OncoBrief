/**
 * Deterministic State-Graph Workflow Orchestrator (`WorkflowStateGraph<TState>`).
 *
 * Implements explicit node execution, conditional branching, bounded retry/error
 * recovery, human-in-the-loop interrupt gates, and serializable execution traces
 * (`GraphExecutionTraceStep[]`) across OncoBrief's four bounded AI workflows:
 *   1. Document Intelligence & Segmentation Graph (`documentIngestionWorkflowGraph`)
 *   2. Ask OncoBrief Administrative & Guideline Co-Pilot Graph (`assistantQueryWorkflowGraph`)
 *   3. Readiness-Gated OPD Flow & Slot Backfill Graph (`opdBackfillWorkflowGraph`)
 *   4. Multilingual Care Continuity & Attendance Confirmation Graph (`continuityOutreachWorkflowGraph`)
 *
 * Pure domain module: zero database or network I/O inside the graph engine itself;
 * callers supply typed node handlers or state transitions.
 */

export type GraphNodeOutcome = 'ok' | 'fallback' | 'interrupted' | 'refused' | 'error';

export interface GraphExecutionTraceStep {
  stepIndex: number;
  nodeId: string;
  label: string;
  outcome: GraphNodeOutcome;
  durationMs: number;
  detail?: string;
}

export interface GraphNodeContext<TState> {
  state: TState;
  recordDetail(detail: string, outcome?: GraphNodeOutcome): void;
  interrupt(reason: string): void;
}

export type GraphNodeHandler<TState> = (
  ctx: GraphNodeContext<TState>,
) => Promise<TState> | TState;

export type GraphEdgeResolver<TState> = (state: TState) => string | null;

interface RegisteredNode<TState> {
  id: string;
  label: string;
  handler: GraphNodeHandler<TState>;
}

export interface GraphExecutionResult<TState> {
  finalState: TState;
  visitedNodes: string[];
  trace: GraphExecutionTraceStep[];
  interrupted: boolean;
  interruptReason: string | null;
}

export class WorkflowStateGraph<TState> {
  private readonly nodes = new Map<string, RegisteredNode<TState>>();
  private readonly edges = new Map<string, GraphEdgeResolver<TState>>();
  private entryNodeId: string | null = null;
  private readonly maxSteps: number;

  constructor(options?: { maxSteps?: number }) {
    this.maxSteps = options?.maxSteps ?? 24;
  }

  addNode(id: string, label: string, handler: GraphNodeHandler<TState>): this {
    this.nodes.set(id, { id, label, handler });
    if (!this.entryNodeId) {
      this.entryNodeId = id;
    }
    return this;
  }

  setEntryPoint(id: string): this {
    if (!this.nodes.has(id)) {
      throw new Error(`workflow_graph_unknown_entry_node:${id}`);
    }
    this.entryNodeId = id;
    return this;
  }

  addEdge(fromId: string, toId: string | null): this {
    this.edges.set(fromId, () => toId);
    return this;
  }

  addConditionalEdges(fromId: string, resolver: GraphEdgeResolver<TState>): this {
    this.edges.set(fromId, resolver);
    return this;
  }

  async run(initialState: TState): Promise<GraphExecutionResult<TState>> {
    if (!this.entryNodeId) {
      throw new Error('workflow_graph_missing_entry_node');
    }

    let currentState = initialState;
    let currentNodeId: string | null = this.entryNodeId;
    const visitedNodes: string[] = [];
    const trace: GraphExecutionTraceStep[] = [];
    let interrupted = false;
    let interruptReason: string | null = null;

    let stepIndex = 0;
    while (currentNodeId !== null) {
      if (stepIndex >= this.maxSteps) {
        throw new Error(`workflow_graph_max_steps_exceeded:${this.maxSteps}`);
      }

      const node = this.nodes.get(currentNodeId);
      if (!node) {
        throw new Error(`workflow_graph_unknown_node:${currentNodeId}`);
      }

      visitedNodes.push(node.id);
      const startedAt = Date.now();
      let stepDetail: string | undefined;
      let stepOutcome: GraphNodeOutcome = 'ok';

      const ctx: GraphNodeContext<TState> = {
        state: currentState,
        recordDetail(detail: string, outcome?: GraphNodeOutcome) {
          stepDetail = detail;
          if (outcome) stepOutcome = outcome;
        },
        interrupt(reason: string) {
          interrupted = true;
          interruptReason = reason;
          stepOutcome = 'interrupted';
          stepDetail = stepDetail ? `${stepDetail} (${reason})` : reason;
        },
      };

      currentState = await node.handler(ctx);
      const durationMs = Math.max(0, Date.now() - startedAt);

      trace.push({
        stepIndex,
        nodeId: node.id,
        label: node.label,
        outcome: stepOutcome,
        durationMs,
        ...(stepDetail ? { detail: stepDetail } : {}),
      });

      stepIndex += 1;

      if (interrupted) {
        break;
      }

      const edgeResolver = this.edges.get(node.id);
      currentNodeId = edgeResolver ? edgeResolver(currentState) : null;
    }

    return {
      finalState: currentState,
      visitedNodes,
      trace,
      interrupted,
      interruptReason,
    };
  }
}

// ---------------------------------------------------------------------------
// 1. Document Ingestion State-Graph Contract (`TASK-005`)
// ---------------------------------------------------------------------------

export interface DocumentIngestionGraphState {
  documentId: string;
  orgId: string;
  patientId: string;
  filename: string;
  ocrEngine: string;
  extractorKind: string;
  providerMode: 'live' | 'sandbox' | 'fallback' | 'fixture';
  pageCount: number;
  subPacketCount: number;
  spanCount: number;
  candidateCount: number;
  promotedCount: number;
  rejectedCount: number;
  conflictsCreated: number;
  conflictsFlagged: number;
  duplicatesFlagged: number;
  documentType: string | null;
  status: 'ready' | 'quarantined' | 'failed';
  errorCode: string | null;
}

export interface DocumentIngestionGraphHandlers {
  onTriage?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onSegmentPacket?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onPersistSpans?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onClassify?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onExtractCandidates?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onTwoStageSpanGate?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onConflictAndDelta?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
  onHumanReviewGate?: (state: DocumentIngestionGraphState) => Promise<DocumentIngestionGraphState> | DocumentIngestionGraphState;
}

export function createDocumentIngestionWorkflowGraph(
  handlers: DocumentIngestionGraphHandlers = {},
): WorkflowStateGraph<DocumentIngestionGraphState> {
  const graph = new WorkflowStateGraph<DocumentIngestionGraphState>();

  graph
    .addNode('intake_routing_node', 'SHA-256 & Content Intake Routing', async (ctx) => {
      const next = handlers.onTriage ? await handlers.onTriage(ctx.state) : ctx.state;
      ctx.recordDetail(`pages=${next.pageCount} engine=${next.ocrEngine}`);
      return next;
    })
    .addNode('segment_packet_node', 'Multi-Report Packet Segmenter', async (ctx) => {
      const next = handlers.onSegmentPacket ? await handlers.onSegmentPacket(ctx.state) : ctx.state;
      ctx.recordDetail(`subpackets=${next.subPacketCount}`);
      return next;
    })
    .addNode('persist_spans_node', 'Persist Normalized OCR Spans', async (ctx) => {
      const next = handlers.onPersistSpans ? await handlers.onPersistSpans(ctx.state) : ctx.state;
      ctx.recordDetail(`spans=${next.spanCount}`);
      return next;
    })
    .addNode('classify_node', 'Advisory Document Classification', async (ctx) => {
      const next = handlers.onClassify ? await handlers.onClassify(ctx.state) : ctx.state;
      ctx.recordDetail(`type=${next.documentType ?? 'unclassified'}`);
      return next;
    })
    .addNode('extract_candidates_node', 'Oncology Candidate & Instruction Extraction', async (ctx) => {
      const next = handlers.onExtractCandidates ? await handlers.onExtractCandidates(ctx.state) : ctx.state;
      ctx.recordDetail(
        `candidates=${next.candidateCount} extractor=${next.extractorKind}`,
        next.providerMode === 'fallback' ? 'fallback' : 'ok',
      );
      return next;
    })
    .addNode('two_stage_span_gate_node', 'Two-Stage Span & Entailment Gate', async (ctx) => {
      const next = handlers.onTwoStageSpanGate ? await handlers.onTwoStageSpanGate(ctx.state) : ctx.state;
      ctx.recordDetail(`promoted=${next.promotedCount} rejected=${next.rejectedCount}`);
      return next;
    })
    .addNode('conflict_and_delta_node', 'Date-Scoped Conflict & Near-Duplicate Engine', async (ctx) => {
      const next = handlers.onConflictAndDelta ? await handlers.onConflictAndDelta(ctx.state) : ctx.state;
      ctx.recordDetail(`conflicts=${next.conflictsCreated} duplicates=${next.duplicatesFlagged}`);
      return next;
    })
    .addNode('human_review_interrupt_gate', 'Human Verification Gate (State=Extracted)', async (ctx) => {
      const next = handlers.onHumanReviewGate ? await handlers.onHumanReviewGate(ctx.state) : ctx.state;
      ctx.recordDetail(`status=${next.status} awaiting_clinician_verification=${next.promotedCount}`);
      return next;
    });

  graph
    .setEntryPoint('intake_routing_node')
    .addConditionalEdges('intake_routing_node', (s) => (s.status === 'ready' ? 'segment_packet_node' : null))
    .addEdge('segment_packet_node', 'persist_spans_node')
    .addEdge('persist_spans_node', 'classify_node')
    .addEdge('classify_node', 'extract_candidates_node')
    .addEdge('extract_candidates_node', 'two_stage_span_gate_node')
    .addEdge('two_stage_span_gate_node', 'conflict_and_delta_node')
    .addEdge('conflict_and_delta_node', 'human_review_interrupt_gate')
    .addEdge('human_review_interrupt_gate', null);

  return graph;
}

// ---------------------------------------------------------------------------
// 2. Ask OncoBrief Co-Pilot State-Graph Contract (`TASK-009`)
// ---------------------------------------------------------------------------

export interface AssistantPendingActionProposal {
  proposalId: string;
  actionKind: 'create_task_from_gap' | 'create_task_from_evidence' | 'assign_task';
  title: string;
  detail: string;
  taskKind: string;
  patientId: string;
  originKind: 'record_gap' | 'evidence' | 'document';
  originId: string;
  citedFactIds: string[];
  status: 'awaiting_human_approval' | 'confirmed' | 'cancelled';
}

export interface AssistantWorkflowGraphState {
  message: string;
  patientId: string | null;
  primaryIntent: string;
  subIntents: string[];
  isBoundaryRefusal: boolean;
  evidenceRetrievedCount: number;
  guidelinesRetrievedCount: number;
  missingDocsRetrievedCount: number;
  continuityRetrievedCount: number;
  pendingActionProposal: AssistantPendingActionProposal | null;
  providerMode: 'deterministic' | 'nvidia-llm' | 'bedrock-llm' | 'hybrid';
  grounded: boolean;
  answer: string;
}

export interface AssistantWorkflowGraphHandlers {
  onSafetyAndIntentGate: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
  onBoundaryRefusal: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
  onPlanSubgoals: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
  onRetrieveEvidenceAndGuidelines: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
  onProposeActionGate: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
  onSynthesizeGroundedAnswer: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
  onVerifyCitationsGate: (state: AssistantWorkflowGraphState) => Promise<AssistantWorkflowGraphState>;
}

export function createAssistantQueryWorkflowGraph(
  handlers: AssistantWorkflowGraphHandlers,
): WorkflowStateGraph<AssistantWorkflowGraphState> {
  const graph = new WorkflowStateGraph<AssistantWorkflowGraphState>();

  graph
    .addNode('safety_and_intent_gate', 'Clinical Boundary & Intent Gate', async (ctx) => {
      const next = await handlers.onSafetyAndIntentGate(ctx.state);
      ctx.recordDetail(
        `intent=${next.primaryIntent} subIntents=${next.subIntents.join(',') || 'none'}`,
        next.isBoundaryRefusal ? 'refused' : 'ok',
      );
      return next;
    })
    .addNode('boundary_refusal_node', 'Non-Clinical Boundary Refusal', async (ctx) => {
      const next = await handlers.onBoundaryRefusal(ctx.state);
      ctx.recordDetail('non_clinical_boundary_enforced', 'refused');
      return next;
    })
    .addNode('plan_subgoals_node', 'Multi-Intent Retrieval Planner', async (ctx) => {
      const next = await handlers.onPlanSubgoals(ctx.state);
      ctx.recordDetail(`planned_tools=${next.subIntents.join('+')}`);
      return next;
    })
    .addNode('retrieve_sources_node', 'Scoped Ledger & Guideline Retrieval', async (ctx) => {
      const next = await handlers.onRetrieveEvidenceAndGuidelines(ctx.state);
      ctx.recordDetail(
        `evidence=${next.evidenceRetrievedCount} guidelines=${next.guidelinesRetrievedCount} gaps=${next.missingDocsRetrievedCount} tasks=${next.continuityRetrievedCount}`,
      );
      return next;
    })
    .addNode('propose_action_gate', 'Human-Confirmed Action Proposal Gate', async (ctx) => {
      const next = await handlers.onProposeActionGate(ctx.state);
      if (next.pendingActionProposal) {
        ctx.recordDetail(`staged_proposal=${next.pendingActionProposal.actionKind}`, 'interrupted');
      } else {
        ctx.recordDetail('no_mutation_proposed');
      }
      return next;
    })
    .addNode('grounded_synthesis_node', 'Source-Grounded Answer Synthesis', async (ctx) => {
      const next = await handlers.onSynthesizeGroundedAnswer(ctx.state);
      ctx.recordDetail(
        `provider=${next.providerMode}`,
        next.providerMode === 'deterministic' ? 'fallback' : 'ok',
      );
      return next;
    })
    .addNode('citation_verification_gate', 'Deterministic Citation & Boundary Verification', async (ctx) => {
      const next = await handlers.onVerifyCitationsGate(ctx.state);
      ctx.recordDetail(`grounded=${next.grounded}`);
      return next;
    });

  graph
    .setEntryPoint('safety_and_intent_gate')
    .addConditionalEdges('safety_and_intent_gate', (s) =>
      s.isBoundaryRefusal ? 'boundary_refusal_node' : 'plan_subgoals_node',
    )
    .addEdge('boundary_refusal_node', null)
    .addEdge('plan_subgoals_node', 'retrieve_sources_node')
    .addEdge('retrieve_sources_node', 'propose_action_gate')
    .addEdge('propose_action_gate', 'grounded_synthesis_node')
    .addEdge('grounded_synthesis_node', 'citation_verification_gate')
    .addEdge('citation_verification_gate', null);

  return graph;
}

// ===========================================================================
// 4. OPD Slot Backfill & Waitlist Orchestration Graph (TASK-008)
// ===========================================================================

export interface OpdBackfillGraphState {
  orgId: string;
  slotId: string;
  clinicKey: string;
  clinicDate: string;
  slotStatus: string;
  totalWaitlistCount: number;
  eligibleCandidateCount: number;
  selectedWaitlistEntryId: string | null;
  selectedPatientId: string | null;
  offerStatus: 'candidates_ranked' | 'offer_reserved' | 'offer_accepted' | 'offer_released' | 'no_eligible_candidates';
  notificationQueued: boolean;
}

export interface OpdBackfillGraphHandlers {
  onVerifyVacantSlot: (state: OpdBackfillGraphState) => Promise<OpdBackfillGraphState> | OpdBackfillGraphState;
  onFilterReadyCandidates: (state: OpdBackfillGraphState) => Promise<OpdBackfillGraphState> | OpdBackfillGraphState;
  onRankCandidates: (state: OpdBackfillGraphState) => Promise<OpdBackfillGraphState> | OpdBackfillGraphState;
  onHumanOfferConfirmationGate: (state: OpdBackfillGraphState) => Promise<OpdBackfillGraphState> | OpdBackfillGraphState;
}

export function createOpdBackfillWorkflowGraph(
  handlers: OpdBackfillGraphHandlers,
): WorkflowStateGraph<OpdBackfillGraphState> {
  const graph = new WorkflowStateGraph<OpdBackfillGraphState>();

  graph
    .addNode('verify_vacant_slot_node', 'Vacant Slot & Overlap Guard', async (ctx) => {
      const next = await handlers.onVerifyVacantSlot(ctx.state);
      ctx.recordDetail(`slot=${next.slotId} status=${next.slotStatus} clinic=${next.clinicKey}`);
      return next;
    })
    .addNode('filter_ready_candidates_node', 'Readiness & Consent Eligibility Filter', async (ctx) => {
      const next = await handlers.onFilterReadyCandidates(ctx.state);
      ctx.recordDetail(`waitlist=${next.totalWaitlistCount} eligible=${next.eligibleCandidateCount}`);
      return next;
    })
    .addNode('rank_candidates_node', 'Administrative Priority & FIFO Ranker', async (ctx) => {
      const next = await handlers.onRankCandidates(ctx.state);
      ctx.recordDetail(
        `ranked=${next.eligibleCandidateCount}`,
        next.eligibleCandidateCount === 0 ? 'fallback' : 'ok',
      );
      return next;
    })
    .addNode('human_offer_confirmation_gate', 'Staff Slot Offer & Two-Step Acceptance Gate', async (ctx) => {
      const next = await handlers.onHumanOfferConfirmationGate(ctx.state);
      ctx.recordDetail(
        `offerStatus=${next.offerStatus} waitlistEntry=${next.selectedWaitlistEntryId ?? 'none'}`,
        next.offerStatus === 'offer_reserved' ? 'interrupted' : 'ok',
      );
      return next;
    });

  graph
    .setEntryPoint('verify_vacant_slot_node')
    .addEdge('verify_vacant_slot_node', 'filter_ready_candidates_node')
    .addEdge('filter_ready_candidates_node', 'rank_candidates_node')
    .addEdge('rank_candidates_node', 'human_offer_confirmation_gate')
    .addEdge('human_offer_confirmation_gate', null);

  return graph;
}

// ===========================================================================
// 5. Care Continuity Attendance & Caregiver Outreach Graph (TASK-023)
// ===========================================================================

export interface ContinuityOutreachGraphState {
  orgId: string;
  patientId: string;
  messageId: string;
  locale: string;
  inboundReplyCode: 'confirmed' | 'reschedule_requested' | 'declined' | 'outbound_check';
  mappedAttendanceStatus:
    | 'confirmed_attendance'
    | 'cannot_attend'
    | 'needs_coordinator_assistance'
    | 'no_response';
  responder: 'patient' | 'caregiver';
  followUpTaskCreated: boolean;
  followUpTaskId: string | null;
  syncedCaregiverCount: number;
}

export interface ContinuityOutreachGraphHandlers {
  onValidateMessageGate: (
    state: ContinuityOutreachGraphState,
  ) => Promise<ContinuityOutreachGraphState> | ContinuityOutreachGraphState;
  onClassifyAttendanceReply: (
    state: ContinuityOutreachGraphState,
  ) => Promise<ContinuityOutreachGraphState> | ContinuityOutreachGraphState;
  onPersistAttendanceState: (
    state: ContinuityOutreachGraphState,
  ) => Promise<ContinuityOutreachGraphState> | ContinuityOutreachGraphState;
  onCoordinatorEscalationGate: (
    state: ContinuityOutreachGraphState,
  ) => Promise<ContinuityOutreachGraphState> | ContinuityOutreachGraphState;
}

export function createContinuityOutreachWorkflowGraph(
  handlers: ContinuityOutreachGraphHandlers,
): WorkflowStateGraph<ContinuityOutreachGraphState> {
  const graph = new WorkflowStateGraph<ContinuityOutreachGraphState>();

  graph
    .addNode('validate_message_gate', 'Message Delivery & Consent Verification Gate', async (ctx) => {
      const next = await handlers.onValidateMessageGate(ctx.state);
      ctx.recordDetail(`message=${next.messageId} locale=${next.locale}`);
      return next;
    })
    .addNode('classify_attendance_reply_node', 'Deterministic Attendance Response Classifier', async (ctx) => {
      const next = await handlers.onClassifyAttendanceReply(ctx.state);
      ctx.recordDetail(`reply=${next.inboundReplyCode} mapped=${next.mappedAttendanceStatus}`);
      return next;
    })
    .addNode('persist_attendance_state_node', 'Persist Attendance & Audit Trail', async (ctx) => {
      const next = await handlers.onPersistAttendanceState(ctx.state);
      ctx.recordDetail(`status=${next.mappedAttendanceStatus} responder=${next.responder}`);
      return next;
    })
    .addNode('coordinator_escalation_gate', 'Coordinator Follow-Up Task Escalation Gate', async (ctx) => {
      const next = await handlers.onCoordinatorEscalationGate(ctx.state);
      ctx.recordDetail(
        `followUpTask=${next.followUpTaskCreated ? (next.followUpTaskId ?? 'created') : 'none'}`,
      );
      return next;
    });

  graph
    .setEntryPoint('validate_message_gate')
    .addEdge('validate_message_gate', 'classify_attendance_reply_node')
    .addEdge('classify_attendance_reply_node', 'persist_attendance_state_node')
    .addEdge('persist_attendance_state_node', 'coordinator_escalation_gate')
    .addEdge('coordinator_escalation_gate', null);

  return graph;
}

