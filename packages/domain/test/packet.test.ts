import { describe, expect, it } from 'vitest';
import { assemblePacket, hashPacketSnapshot, MANDATORY_SECTIONS } from '../src/index';
import type { PacketInput } from '../src/index';

const EMPTY: PacketInput = { facts: [], gaps: [], conflicts: [], tasks: [] };

describe('assemblePacket', () => {
  it('renders the mandatory sections even when empty', () => {
    const packet = assemblePacket(EMPTY);
    for (const section of MANDATORY_SECTIONS) {
      expect(packet.sections.find((s) => s.section === section)).toBeDefined();
    }
  });

  it('includes an unverified fact and badges it rather than dropping it', () => {
    const packet = assemblePacket({
      ...EMPTY,
      facts: [
        {
          evidenceFactId: 'f1',
          factType: 'document.date',
          valueText: '2025-06-12',
          verbatimQuote: 'Date of surgery: 12 June 2025',
          documentId: 'd1',
          documentName: 'Discharge summary',
          pageNumber: 1,
          state: 'extracted',
          confidenceBand: 'high',
          extractorKind: 'rule',
          reviewerName: null,
          reviewedAt: null,
        },
      ],
    });
    const inventory = packet.sections.find((s) => s.section === 'document_inventory')!;
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]!.stateAtSnapshot).toBe('extracted');
    expect(inventory.items[0]!.inclusionReason).toContain('not yet verified');
    expect(packet.counts.unverifiedFacts).toBe(1);
  });

  it('places a medication fact in the medications section', () => {
    const packet = assemblePacket({
      ...EMPTY,
      facts: [
        {
          evidenceFactId: 'f1',
          factType: 'medication.recorded',
          valueText: 'Tamoxifen',
          verbatimQuote: 'Tamoxifen 20 mg',
          documentId: 'd1',
          documentName: 'Prescription',
          pageNumber: 1,
          state: 'verified',
          confidenceBand: 'high',
          extractorKind: 'rule',
          reviewerName: 'Dr A',
          reviewedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(packet.sections.find((s) => s.section === 'medications_recorded')!.items).toHaveLength(1);
  });

  it('lists missing documents', () => {
    const packet = assemblePacket({
      ...EMPTY,
      gaps: [
        { recordGapId: 'g1', checklistItemLabel: 'Insurance authorization', requirementKind: 'required', status: 'missing' },
        { recordGapId: 'g2', checklistItemLabel: 'Referral note', requirementKind: 'required', status: 'satisfied' },
      ],
    });
    const missing = packet.sections.find((s) => s.section === 'missing_documents')!;
    expect(missing.items).toHaveLength(1);
    expect(packet.counts.missingDocuments).toBe(1);
  });

  it('lists open conflicts', () => {
    const packet = assemblePacket({
      ...EMPTY,
      conflicts: [
        {
          conflictSetId: 'c1',
          factType: 'document.date',
          slotKey: 'document.date|document',
          reason: 'disagreement',
          memberValueTexts: ['2025-06-12', '2025-07-03'],
        },
      ],
    });
    expect(packet.sections.find((s) => s.section === 'open_conflicts')!.items).toHaveLength(1);
  });

  it('ordinals within a section are dense and 1-based', () => {
    const packet = assemblePacket({
      ...EMPTY,
      gaps: [
        { recordGapId: 'g1', checklistItemLabel: 'A', requirementKind: 'required', status: 'missing' },
        { recordGapId: 'g2', checklistItemLabel: 'B', requirementKind: 'required', status: 'missing' },
      ],
    });
    const items = packet.sections.find((s) => s.section === 'missing_documents')!.items;
    expect(items.map((i) => i.ordinal)).toEqual([1, 2]);
  });
});

describe('hashPacketSnapshot', () => {
  it('is deterministic', () => {
    const packet = assemblePacket(EMPTY);
    const snapshot = {
      assembled: packet,
      ledgerSeqAtApproval: 10,
      approvedBy: 'u1',
      approvedAt: '2025-01-01T00:00:00.000Z',
      approvalNote: null,
    };
    expect(hashPacketSnapshot(snapshot)).toBe(hashPacketSnapshot(snapshot));
  });

  it('changes if the ledger position changes', () => {
    const packet = assemblePacket(EMPTY);
    const a = { assembled: packet, ledgerSeqAtApproval: 10, approvedBy: 'u1', approvedAt: 'x', approvalNote: null };
    const b = { ...a, ledgerSeqAtApproval: 11 };
    expect(hashPacketSnapshot(a)).not.toBe(hashPacketSnapshot(b));
  });
});
