import { canonicalJson } from '../ledger/canonical-json';
import { sha256Hex } from '../ledger/hash-chain';
import type { EvidenceStateValue } from '../evidence/state';
import type { FactType } from '../vocab/fact-types';
import type { GapStatus } from '../twin/gaps';

/**
 * Consultation packet assembly (architecture §11).
 *
 * Approval freezes; it does not transform. On approval the server serialises
 * the fully resolved packet into `snapshot_json`, hashes it, and records the
 * ledger position. Later ledger activity cannot alter an approved packet.
 *
 * Two sections are non-negotiable and render even when empty: `open_conflicts`
 * and `missing_documents`. A consult-prep artefact that quietly omits what it
 * does not know is the omission failure mode the research identifies as more
 * dangerous than hallucination. Unverified items are included and badged,
 * never dropped.
 */

export const PACKET_SECTIONS = [
  'identity_and_identifiers',
  'document_inventory',
  'transcribed_clinical_text',
  'medications_recorded',
  'appointments_and_referrals',
  'open_conflicts',
  'missing_documents',
  'open_tasks',
] as const;

export type PacketSection = (typeof PACKET_SECTIONS)[number];

export const PACKET_SECTION_LABEL: Record<PacketSection, string> = {
  identity_and_identifiers: 'Identity and identifiers',
  document_inventory: 'Document inventory',
  transcribed_clinical_text: 'Transcribed document text',
  medications_recorded: 'Medications recorded',
  appointments_and_referrals: 'Appointments, referrals and dates recorded',
  open_conflicts: 'Open source conflicts',
  missing_documents: 'Missing documents',
  open_tasks: 'Confirmed operational tasks',
};

const SECTION_BY_FACT_TYPE: Record<FactType, PacketSection> = {
  'identifier.mrn': 'identity_and_identifiers',
  'identifier.abha': 'identity_and_identifiers',
  'document.date': 'document_inventory',
  'document.issuing_facility': 'document_inventory',
  'document.type_as_written': 'document_inventory',
  'procedure.recorded': 'transcribed_clinical_text',
  'diagnosis_text.as_written': 'transcribed_clinical_text',
  'stage_text.as_written': 'transcribed_clinical_text',
  'lab_result.as_written': 'transcribed_clinical_text',
  'imaging.recorded': 'transcribed_clinical_text',
  'radiation.recorded': 'transcribed_clinical_text',
  'chemotherapy_cycle.recorded': 'transcribed_clinical_text',
  'medication.recorded': 'medications_recorded',
  'appointment.recorded': 'appointments_and_referrals',
  'referral.recorded': 'appointments_and_referrals',
  'followup.recorded': 'appointments_and_referrals',
  'consent.recorded': 'appointments_and_referrals',
};

export function sectionForFactType(factType: FactType): PacketSection {
  return SECTION_BY_FACT_TYPE[factType];
}

export interface PacketFactSnapshot {
  evidenceFactId: string;
  factType: FactType;
  valueText: string;
  verbatimQuote: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  state: EvidenceStateValue;
  confidenceBand: string;
  extractorKind: string;
  reviewerName: string | null;
  reviewedAt: string | null;
}

export interface PacketGapSnapshot {
  recordGapId: string;
  checklistItemLabel: string;
  requirementKind: string;
  status: GapStatus;
}

export interface PacketConflictSnapshot {
  conflictSetId: string;
  factType: string;
  slotKey: string;
  reason: string;
  memberValueTexts: string[];
}

export interface PacketTaskSnapshot {
  taskId: string;
  title: string;
  taskKind: string;
  status: string;
  dueOn: string | null;
  originKind: string;
}

export interface PacketInput {
  facts: readonly PacketFactSnapshot[];
  gaps: readonly PacketGapSnapshot[];
  conflicts: readonly PacketConflictSnapshot[];
  tasks: readonly PacketTaskSnapshot[];
}

export interface PacketItem {
  section: PacketSection;
  ordinal: number;
  evidenceFactId?: string;
  recordGapId?: string;
  conflictSetId?: string;
  taskId?: string;
  stateAtSnapshot?: EvidenceStateValue;
  inclusionReason: string;
  fact?: PacketFactSnapshot;
  gap?: PacketGapSnapshot;
  conflict?: PacketConflictSnapshot;
  task?: PacketTaskSnapshot;
}

export interface AssembledPacket {
  sections: { section: PacketSection; label: string; items: PacketItem[] }[];
  counts: {
    facts: number;
    unverifiedFacts: number;
    openConflicts: number;
    missingDocuments: number;
    openTasks: number;
  };
}

/** Sections that must always render, even empty (architecture §11.2). */
export const MANDATORY_SECTIONS: readonly PacketSection[] = ['open_conflicts', 'missing_documents'];

export function assemblePacket(input: PacketInput): AssembledPacket {
  const items: PacketItem[] = [];

  for (const fact of input.facts) {
    items.push({
      section: sectionForFactType(fact.factType),
      ordinal: 0,
      evidenceFactId: fact.evidenceFactId,
      stateAtSnapshot: fact.state,
      inclusionReason:
        fact.state === 'verified' || fact.state === 'corrected'
          ? 'Human-confirmed evidence'
          : 'Extracted evidence — not yet verified',
      fact,
    });
  }

  for (const conflict of input.conflicts) {
    items.push({
      section: 'open_conflicts',
      ordinal: 0,
      conflictSetId: conflict.conflictSetId,
      inclusionReason: 'Two or more sources disagree; human resolution pending',
      conflict,
    });
  }

  for (const gap of input.gaps) {
    if (gap.status === 'missing' || gap.status === 'partial') {
      items.push({
        section: 'missing_documents',
        ordinal: 0,
        recordGapId: gap.recordGapId,
        inclusionReason:
          gap.status === 'missing'
            ? 'No document of this type is present in the workspace'
            : 'A document is present but its type is not yet confirmed',
        gap,
      });
    }
  }

  for (const task of input.tasks) {
    items.push({
      section: 'open_tasks',
      ordinal: 0,
      taskId: task.taskId,
      inclusionReason: 'Administrative task anchored to a source object',
      task,
    });
  }

  const sections = PACKET_SECTIONS.map((section) => {
    const sectionItems = items
      .filter((i) => i.section === section)
      .sort((a, b) => a.inclusionReason.localeCompare(b.inclusionReason))
      .map((item, idx) => ({ ...item, ordinal: idx + 1 }));
    return { section, label: PACKET_SECTION_LABEL[section], items: sectionItems };
  });

  return {
    sections,
    counts: {
      facts: input.facts.length,
      unverifiedFacts: input.facts.filter(
        (f) => f.state !== 'verified' && f.state !== 'corrected',
      ).length,
      openConflicts: input.conflicts.length,
      missingDocuments: input.gaps.filter((g) => g.status === 'missing' || g.status === 'partial')
        .length,
      openTasks: input.tasks.length,
    },
  };
}

export interface PacketSnapshot {
  assembled: AssembledPacket;
  ledgerSeqAtApproval: number;
  approvedBy: string;
  approvedAt: string;
  approvalNote: string | null;
}

/** Deterministic content hash recorded on approval. */
export function hashPacketSnapshot(snapshot: PacketSnapshot): string {
  return sha256Hex(canonicalJson(snapshot));
}
