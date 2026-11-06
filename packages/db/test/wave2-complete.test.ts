import { describe, expect, it } from 'vitest';
import {
  acceptOpdSlotOffer,
  approveMessage,
  composeMessage,
  consumeExtensionGrant,
  createDocument,
  createMessageTemplate,
  createPacket,
  declineOpdSlotOffer,
  deliverMessage,
  expireStaleOpdSlotOffers,
  getOperationalAnalyticsSummary,
  ingestGuidelineDocumentPdf,
  ingestNormalizedPages,
  issueExtensionGrant,
  listDocumentSubpackets,
  listGuidelineSpansForDocument,
  mintExtensionGrant,
  offerOpdSlot,
  processInboundAttendanceWebhook,
  redeemExtensionGrantAndIngest,
  releaseOpdSlotOffer,
  updateTaskPriorityAndDueOn,
  withdrawPacket,
} from '../src';

describe('Wave 2 & Wave 3 Complete Scope — Database & Service Integration Contracts', () => {
  it('exports all Wave 2 and Wave 3 service entrypoints from @oncobrief/db', () => {
    expect(typeof acceptOpdSlotOffer).toBe('function');
    expect(typeof declineOpdSlotOffer).toBe('function');
    expect(typeof releaseOpdSlotOffer).toBe('function');
    expect(typeof expireStaleOpdSlotOffers).toBe('function');
    expect(typeof offerOpdSlot).toBe('function');
    expect(typeof mintExtensionGrant).toBe('function');
    expect(typeof issueExtensionGrant).toBe('function');
    expect(typeof consumeExtensionGrant).toBe('function');
    expect(typeof redeemExtensionGrantAndIngest).toBe('function');
    expect(typeof listDocumentSubpackets).toBe('function');
    expect(typeof ingestNormalizedPages).toBe('function');
    expect(typeof ingestGuidelineDocumentPdf).toBe('function');
    expect(typeof listGuidelineSpansForDocument).toBe('function');
    expect(typeof processInboundAttendanceWebhook).toBe('function');
    expect(typeof updateTaskPriorityAndDueOn).toBe('function');
    expect(typeof getOperationalAnalyticsSummary).toBe('function');
    expect(typeof withdrawPacket).toBe('function');
    expect(typeof createPacket).toBe('function');
    expect(typeof createDocument).toBe('function');
    expect(typeof createMessageTemplate).toBe('function');
    expect(typeof composeMessage).toBe('function');
    expect(typeof approveMessage).toBe('function');
    expect(typeof deliverMessage).toBe('function');
  });
});
