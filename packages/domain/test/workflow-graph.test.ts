import { describe, expect, it } from 'vitest';
import {
  WorkflowStateGraph,
  createDocumentIngestionWorkflowGraph,
  createAssistantQueryWorkflowGraph,
  type DocumentIngestionGraphState,
  type AssistantWorkflowGraphState,
} from '../src/index';

describe('WorkflowStateGraph orchestration engine (TASK-005 & TASK-009)', () => {
  it('executes documentIngestionWorkflowGraph nodes in deterministic order and records execution trace', async () => {
    const initial: DocumentIngestionGraphState = {
      documentId: 'doc-001',
      orgId: 'org-001',
      patientId: 'pat-001',
      filename: 'Pathology_Report.pdf',
      ocrEngine: 'local-multimodal',
      extractorKind: 'rule',
      providerMode: 'live',
      pageCount: 2,
      subPacketCount: 1,
      spanCount: 0,
      candidateCount: 0,
      promotedCount: 0,
      rejectedCount: 0,
      conflictsCreated: 0,
      conflictsFlagged: 0,
      duplicatesFlagged: 0,
      documentType: null,
      status: 'ready',
      errorCode: null,
    };

    const graph = createDocumentIngestionWorkflowGraph({
      onSegmentPacket: (s) => ({ ...s, subPacketCount: 2 }),
      onPersistSpans: (s) => ({ ...s, spanCount: 14 }),
      onClassify: (s) => ({ ...s, documentType: 'pathology_report' }),
      onExtractCandidates: (s) => ({ ...s, candidateCount: 5 }),
      onTwoStageSpanGate: (s) => ({ ...s, promotedCount: 4, rejectedCount: 1 }),
      onConflictAndDelta: (s) => ({ ...s, conflictsCreated: 1 }),
    });

    const result = await graph.run(initial);

    expect(result.interrupted).toBe(false);
    expect(result.visitedNodes).toEqual([
      'intake_routing_node',
      'segment_packet_node',
      'persist_spans_node',
      'classify_node',
      'extract_candidates_node',
      'two_stage_span_gate_node',
      'conflict_and_delta_node',
      'human_review_interrupt_gate',
    ]);
    expect(result.finalState.promotedCount).toBe(4);
    expect(result.finalState.rejectedCount).toBe(1);
    expect(result.finalState.documentType).toBe('pathology_report');
    expect(result.trace).toHaveLength(8);
    expect(result.trace[5]?.nodeId).toBe('two_stage_span_gate_node');
    expect(result.trace[5]?.detail).toContain('promoted=4 rejected=1');
  });

  it('short-circuits assistantQueryWorkflowGraph to boundary_refusal_node on unsupported medical queries', async () => {
    const initial: AssistantWorkflowGraphState = {
      message: 'What chemotherapy dose should I prescribe for this patient?',
      patientId: 'pat-001',
      primaryIntent: 'unsupported_medical_question',
      subIntents: [],
      isBoundaryRefusal: false,
      evidenceRetrievedCount: 0,
      guidelinesRetrievedCount: 0,
      missingDocsRetrievedCount: 0,
      continuityRetrievedCount: 0,
      pendingActionProposal: null,
      providerMode: 'deterministic',
      grounded: false,
      answer: '',
    };

    const graph = createAssistantQueryWorkflowGraph({
      onSafetyAndIntentGate: async (s) => ({ ...s, isBoundaryRefusal: true }),
      onBoundaryRefusal: async (s) => ({
        ...s,
        answer: 'OncoBrief is a non-clinical record-readiness tool and cannot prescribe treatment.',
      }),
      onPlanSubgoals: async (s) => s,
      onRetrieveEvidenceAndGuidelines: async (s) => s,
      onProposeActionGate: async (s) => s,
      onSynthesizeGroundedAnswer: async (s) => s,
      onVerifyCitationsGate: async (s) => s,
    });

    const result = await graph.run(initial);
    expect(result.visitedNodes).toEqual(['safety_and_intent_gate', 'boundary_refusal_node']);
    expect(result.finalState.answer).toContain('non-clinical record-readiness');
    expect(result.trace[1]?.outcome).toBe('refused');
  });

  it('enforces maxSteps guard against accidental cyclic edges', async () => {
    const graph = new WorkflowStateGraph<{ count: number }>({ maxSteps: 5 });
    graph
      .addNode('loop_a', 'Loop A', (ctx) => ({ count: ctx.state.count + 1 }))
      .addNode('loop_b', 'Loop B', (ctx) => ({ count: ctx.state.count + 1 }))
      .addEdge('loop_a', 'loop_b')
      .addEdge('loop_b', 'loop_a');

    await expect(graph.run({ count: 0 })).rejects.toThrow('workflow_graph_max_steps_exceeded:5');
  });

  it('executes createOpdBackfillWorkflowGraph and records candidate ranking trace (TASK-008)', async () => {
    const { createOpdBackfillWorkflowGraph } = await import('../src/index');
    const graph = createOpdBackfillWorkflowGraph({
      onVerifyVacantSlot: (s) => ({ ...s, slotStatus: 'vacant' }),
      onFilterReadyCandidates: (s) => ({ ...s, totalWaitlistCount: 5, eligibleCandidateCount: 2 }),
      onRankCandidates: (s) => ({
        ...s,
        selectedWaitlistEntryId: 'wl-001',
        selectedPatientId: 'pat-001',
        offerStatus: 'candidates_ranked',
      }),
      onHumanOfferConfirmationGate: (s) => ({ ...s, offerStatus: 'offer_reserved' }),
    });

    const result = await graph.run({
      orgId: 'org-001',
      slotId: 'slot-001',
      clinicKey: 'med_onc_opd',
      clinicDate: '2026-05-18',
      slotStatus: 'vacant',
      totalWaitlistCount: 0,
      eligibleCandidateCount: 0,
      selectedWaitlistEntryId: null,
      selectedPatientId: null,
      offerStatus: 'candidates_ranked',
      notificationQueued: false,
    });

    expect(result.visitedNodes).toEqual([
      'verify_vacant_slot_node',
      'filter_ready_candidates_node',
      'rank_candidates_node',
      'human_offer_confirmation_gate',
    ]);
    expect(result.finalState.selectedWaitlistEntryId).toBe('wl-001');
    expect(result.finalState.offerStatus).toBe('offer_reserved');
  });

  it('executes createContinuityOutreachWorkflowGraph and escalates reschedule_requested to coordinator task (TASK-023)', async () => {
    const { createContinuityOutreachWorkflowGraph } = await import('../src/index');
    const graph = createContinuityOutreachWorkflowGraph({
      onValidateMessageGate: (s) => ({ ...s, patientId: 'pat-001', locale: 'hi-IN' }),
      onClassifyAttendanceReply: (s) => ({
        ...s,
        mappedAttendanceStatus: 'needs_coordinator_assistance',
      }),
      onPersistAttendanceState: (s) => s,
      onCoordinatorEscalationGate: (s) => ({
        ...s,
        followUpTaskCreated: true,
        followUpTaskId: 'task-resched-001',
      }),
    });

    const result = await graph.run({
      orgId: 'org-001',
      patientId: '',
      messageId: 'msg-001',
      locale: 'en-IN',
      inboundReplyCode: 'reschedule_requested',
      mappedAttendanceStatus: 'no_response',
      responder: 'caregiver',
      followUpTaskCreated: false,
      followUpTaskId: null,
      syncedCaregiverCount: 1,
    });

    expect(result.visitedNodes).toEqual([
      'validate_message_gate',
      'classify_attendance_reply_node',
      'persist_attendance_state_node',
      'coordinator_escalation_gate',
    ]);
    expect(result.finalState.mappedAttendanceStatus).toBe('needs_coordinator_assistance');
    expect(result.finalState.followUpTaskCreated).toBe(true);
    expect(result.finalState.followUpTaskId).toBe('task-resched-001');
  });
});

