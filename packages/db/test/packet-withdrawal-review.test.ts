import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SimulatedAbdmGatewayAdapter, generateEphemeralKeyPair } from '@oncobrief/adapters';
import { closePools, withTenant } from '../src/client';
import { setupFixtures, type Fixtures } from './helpers';
import { approvePacket, assertPacketSourcesAccessible, createPacket, getPacket, getPacketExportBundle } from '../src/services/packets';
import { handleHipConsentNotify, processHealthInfoRequest } from '../src/services/abdm-hip';
import { upsertAbdmPatientLink } from '../src/services/patients';

let fx: Fixtures;
beforeAll(async () => { fx = await setupFixtures(); }, 120_000);
afterAll(closePools);

describe('independent source-withdrawal regressions', () => {
  it('masks frozen packet content and denies all bundle formats when app RLS hides its source', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const { packetId } = await createPacket(q, { orgId: fx.org1, patientId: fx.patients.demo3, userId: fx.clinicians.clinician, encounterLabel: 'withdrawal regression' });
      await approvePacket(q, { packetId, userId: fx.clinicians.clinician });
      await q.query(`UPDATE document SET ingest_error='consent_revoked_or_expired' WHERE id=$1`, [fx.sampleDocumentId]);
      try {
        expect((await q.query('SELECT id FROM evidence_fact WHERE document_id=$1', [fx.sampleDocumentId])).rowCount).toBe(0);
        await expect(assertPacketSourcesAccessible(q, fx.org1, packetId)).rejects.toThrow('packet_source_withdrawn');
        for (const format of ['abdm', 'mcode'] as const) {
          await expect(getPacketExportBundle(q, fx.org1, packetId, format)).rejects.toThrow('packet_source_withdrawn');
        }
        const detail = await getPacket(q, fx.org1, packetId);
        expect(detail?.assembled === null).toBe(true);
        // Frozen source validation cannot rely on mutable packet_item rows.
        await q.query('DELETE FROM packet_item WHERE packet_id=$1', [packetId]);
        await expect(assertPacketSourcesAccessible(q, fx.org1, packetId)).rejects.toThrow('packet_source_withdrawn');
      } finally { await q.query('UPDATE document SET ingest_error=NULL WHERE id=$1', [fx.sampleDocumentId]); }
    });
  });

  it('refuses HIP push of an approved frozen packet after its imported source was withdrawn', async () => {
    await withTenant({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' }, async (q) => {
      const gateway = new SimulatedAbdmGatewayAdapter();
      const push = vi.spyOn(gateway, 'pushHealthInformation');
      const { packetId } = await createPacket(q, { orgId: fx.org1, patientId: fx.patients.demo3, userId: fx.clinicians.clinician, encounterLabel: 'HIP withdrawal regression' });
      await approvePacket(q, { packetId, userId: fx.clinicians.clinician });
      await upsertAbdmPatientLink(q, { orgId: fx.org1, patientId: fx.patients.demo3, abhaAddress: 'withdrawal-review@sbx' });
      const cc = `CC-${packetId}`;
      await q.query(`INSERT INTO abdm_care_context (org_id,patient_id,packet_id,care_context_reference,display_label,abha_address,status,linked_at) VALUES ($1,$2,$3,$4,'Review','withdrawal-review@sbx','LINKED',now())`, [fx.org1,fx.patients.demo3,packetId,cc]);
      const consentId = `REVIEW-${randomUUID()}`;
      const future = new Date(Date.now()+86400000).toISOString();
      await handleHipConsentNotify(q, { orgId: fx.org1, inboundRequestId: randomUUID(), consentId, status: 'GRANTED', consentDetail: { patient: { id: 'withdrawal-review@sbx' }, hiTypes: ['OPConsultation'], careContexts: [{ careContextReference: cc }], permission: { dateRange: { from: '2025-01-01T00:00:00Z', to: future }, dataEraseAt: future } }, gateway });
      await q.query(`UPDATE document SET ingest_error='consent_revoked_or_expired' WHERE id=$1`, [fx.sampleDocumentId]);
      try {
        await expect(processHealthInfoRequest(q, { orgId: fx.org1, inboundRequestId: randomUUID(), transactionId: randomUUID(), consentId, dataPushUrl: 'https://synthetic.invalid/push', keyMaterial: generateEphemeralKeyPair().keyMaterial, gateway })).rejects.toThrow('packet_source_withdrawn');
        expect(push).not.toHaveBeenCalled();
      } finally { await q.query('UPDATE document SET ingest_error=NULL WHERE id=$1', [fx.sampleDocumentId]); }
    });
  });
});
