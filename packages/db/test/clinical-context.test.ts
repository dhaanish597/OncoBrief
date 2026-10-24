import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools, getMigratorPool, withTenant } from '../src/client';
import { getPatientClinicalSummary, listPatientObservations } from '../src/services/patients';
import { createDocument, ingestNormalizedPages } from '../src/services/documents';
import { insertFact, correctEvidence } from '../src/services/ledger';
import { RuleBasedExtractor } from '@oncobrief/adapters';
import { setupFixtures, type Fixtures } from './helpers';
import type { StoragePort } from '@oncobrief/ports';
let fx: Fixtures;
beforeAll(async () => { fx = await setupFixtures(); });
afterAll(closePools);
const storage = { put: async () => ({ sha256: '' }) } as unknown as StoragePort;
const tenant = () => ({ orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const });

describe('Clinical Context ledger projection', () => {
  it('reads source-linked observations without writing documents, ledger or audit', async () => {
    await withTenant(tenant(), async (q) => {
      const counts = async () => (await q.query('SELECT (SELECT count(*) FROM ledger_entry) AS ledger, (SELECT count(*) FROM audit_event) AS audit, (SELECT count(*) FROM evidence_fact) AS facts')).rows;
      const before = await counts();
      const summary = await getPatientClinicalSummary(q, fx.patients.demo1);
      expect(summary?.allObservations.length).toBeGreaterThan(0);
      for (const obs of summary!.allObservations) {
        expect(obs.documentId).toBeTruthy(); expect(obs.id).toBeTruthy(); expect(obs.pageNumber).toBeGreaterThan(0);
      }
      expect(await counts()).toEqual(before);
    });
  });
  it('enforces tenant isolation for summaries and observations', async () => {
    await withTenant(tenant(), async (q) => {
      expect(await getPatientClinicalSummary(q, fx.patients.otherTenant)).toBeNull();
      expect(await listPatientObservations(q, fx.patients.otherTenant)).toEqual([]);
    });
  });
  it('preserves same-date conflicts, qualified results and unstated units', async () => {
    await withTenant(tenant(), async (q) => {
      const patient = await q.query<{id: string}>("INSERT INTO patient(org_id,display_name,is_demo_fixture) VALUES($1,'Synthetic Clinical Context',true) RETURNING id",[fx.org1]);
      const patientId = patient.rows[0]!.id;
      for (const value of ['11.4', '10.2']) {
        const text = `Date: 02 June 2026\nHemoglobin: ${value} g/dL\nWeight: 65\nHeight: 170\nMarker: <5 ng/mL`;
        const {documentId} = await createDocument(q, storage, {orgId: fx.org1, patientId, uploadedBy: fx.clinicians.clinician, filename:'clinical.txt', mimeType:'text/plain', content: Buffer.from(text+randomUUID()),sourceKind:'upload',isDemoFixture:true});
        await ingestNormalizedPages(q,new RuleBasedExtractor(),documentId,[{pageNumber:1,widthPx:800,heightPx:1100,plainText:text,engine:'fixture',engineVersion:'1',spans:text.split('\n').map((text,index)=>({index,text,granularity:'line',charStart:0,charEnd:text.length,bbox:{x:0.1,y:index*0.1,w:0.8,h:0.05},confidence:0.99}))}]);
      }
      const summary = await getPatientClinicalSummary(q, patientId);
      const hb = summary!.allObservations.filter((o)=>o.canonicalKey==='haemoglobin');
      expect(hb.map((o)=>o.valueText).sort()).toEqual(['10.2','11.4']);
      expect(hb.every((o)=>o.state==='conflicting')).toBe(true);
      expect(summary!.overview.weight?.unit).toBe('');
      expect(summary!.overview.derivedBMI.derived).toBe(false);
      const qualified = summary!.allObservations.find((o)=>o.valueText==='<5');
      expect(qualified).toBeDefined(); expect(qualified!.numericValue).toBeUndefined();
    });
  });
  it('shows the replacement after a human correction while retaining original ledger history', async () => {
    await withTenant(tenant(), async (q) => {
      const created = await insertFact(q, { orgId: fx.org1, patientId: fx.patients.demo3,
        factType: 'lab_result.as_written', value: { kind: 'lab', name: 'Synthetic marker', valueText: '10', unitText: 'ng/mL' },
        verbatimQuote: fx.sampleSpanText, spanIds: [fx.sampleSpanId], documentId: fx.sampleDocumentId,
        extractorKind: 'rule', extractorName: 'test', extractorVersion: '1', confidenceRaw: 0.8, createdBy: null });
      expect(created.ok).toBe(true); if (!created.ok) throw new Error('insert failed');
      const correction = await correctEvidence(q, { factId: created.factId,
        actor: { kind: 'human', userId: fx.clinicians.clinician, role: 'clinician' },
        value: { kind: 'lab', name: 'Synthetic marker', valueText: '12', unitText: 'ng/mL' },
        verbatimQuote: fx.sampleSpanText, reason: 'Synthetic transcription correction' });
      const observations = await listPatientObservations(q, fx.patients.demo3);
      expect(observations.some((o) => o.id === created.factId)).toBe(false);
      expect(observations.find((o) => o.id === correction.replacementFactId)?.valueText).toBe('12');
      expect((await q.query('SELECT id FROM evidence_fact WHERE id=$1', [created.factId])).rows).toHaveLength(1);
    });
  });
  it('does not turn arbitrary assay names into demographics or receptor biomarkers', async () => {
    await withTenant(tenant(), async (q) => {
      for (const name of ['Average Glucose', 'Sex Hormone Binding Globulin', 'Protein Electrophoresis']) {
        await insertFact(q, { orgId: fx.org1, patientId: fx.patients.demo3,
          factType: 'lab_result.as_written', value: { kind: 'lab', name, valueText: '24', unitText: 'arbitrary' },
          verbatimQuote: fx.sampleSpanText, spanIds: [fx.sampleSpanId], documentId: fx.sampleDocumentId,
          extractorKind: 'rule', extractorName: 'test', extractorVersion: '1', confidenceRaw: 0.8, createdBy: null });
      }
      const summary = await getPatientClinicalSummary(q, fx.patients.demo3);
      expect(summary!.overview.age).toBeUndefined(); expect(summary!.overview.sex).toBeUndefined();
      expect(summary!.cards.pathology.biomarkers.some((o) => o.asWrittenName === 'Protein Electrophoresis')).toBe(false);
    });
  });
  it('hides withdrawn source content through the runtime role', async () => {
    const doc = await getMigratorPool().query<{id:string}>("SELECT id FROM document WHERE patient_id=$1 LIMIT 1",[fx.patients.demo3]);
    const id=doc.rows[0]!.id;
    await getMigratorPool().query("UPDATE document SET ingest_error='consent_revoked_or_expired' WHERE id=$1",[id]);
    try {
      await withTenant(tenant(),async(q)=> {
        expect((await listPatientObservations(q,fx.patients.demo3)).some((o)=>o.documentId===id)).toBe(false);
      });
    } finally { await getMigratorPool().query('UPDATE document SET ingest_error=NULL WHERE id=$1',[id]); }
  });
});
