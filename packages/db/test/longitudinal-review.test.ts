import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { buildSyntheticPdf } from '../../../apps/worker/src/fixture-pdf';
import { closePools, withTenant, type Querier } from '../src/client';
import {
  createDocument,
  ingestDocument,
  ingestNormalizedPages,
} from '../src/services/documents';
import { getLongitudinalReview } from '../src/services/longitudinal-review';
import { getProvenance } from '../src/services/patients';
import {
  LocalMultimodalOcrAdapter,
  RuleBasedExtractor,
} from '@oncobrief/adapters';
import type { StoragePort } from '@oncobrief/ports';
import { setupFixtures, type Fixtures } from './helpers';

let fx: Fixtures;
beforeAll(async () => {
  fx = await setupFixtures();
});
afterAll(closePools);
const storage: StoragePort = {
  async put() {
    return { sha256: '' };
  },
  async get() {
    throw new Error('not_used');
  },
  async presignGet() {
    return '';
  },
  async delete() {},
};
async function ingest(
  q: Querier,
  patientId: string,
  date: string,
  value: string,
) {
  const text = `Date: ${date}\nHemoglobin: ${value} g/dL\nAwaiting IHC report\nBring prior imaging CD`;
  const created = await createDocument(q, storage, {
    orgId: fx.org1,
    patientId,
    uploadedBy: fx.clinicians.clinician,
    filename: 'synthetic-lab.txt',
    mimeType: 'text/plain',
    content: Buffer.from(`${text}\nSynthetic ${randomUUID()}`),
    sourceKind: 'upload',
    isDemoFixture: true,
  });
  const result = await ingestNormalizedPages(
    q,
    new RuleBasedExtractor(),
    created.documentId,
    [
      {
        pageNumber: 1,
        widthPx: 612,
        heightPx: 792,
        plainText: text,
        engine: 'fixture',
        engineVersion: 'v1',
        spans: text.split('\n').map((text, index) => ({
          granularity: 'line',
          index,
          text,
          charStart: 0,
          charEnd: text.length,
          bbox: { x: 0.1, y: 0.1 + index * 0.1, w: 0.8, h: 0.04 },
          confidence: 0.99,
        })),
      },
    ],
  );
  expect(result.rejected).toBe(0);
  return created.documentId;
}
async function newPatient(q: Querier) {
  const patient = await q.query<{ id: string }>(
    "INSERT INTO patient(org_id,display_name,is_demo_fixture,last_consultation_date) VALUES($1,'Synthetic Phase One',true,'2026-06-30') RETURNING id",
    [fx.org1],
  );
  return patient.rows[0]!.id;
}

describe('source-linked longitudinal ledger read', () => {
  it('reads source-date series, pending instructions and exact source provenance through ingestion', async () => {
    await withTenant(
      { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' },
      async (q) => {
        const patientId = await newPatient(q);
        const documentId = await ingest(q, patientId, '02 June 2026', '11.4');
        await ingest(q, patientId, '26 July 2026', '10.2');
        const review = await getLongitudinalReview(q, patientId);
        expect(review?.interval.baselineDate).toBe('2026-06-30');
        expect(review?.interval.newDocumentsCount).toBe(2);
        expect(review?.interval.pendingInvestigations).toHaveLength(2);
        expect(review?.interval.documentedInstructions).toHaveLength(2);
        expect(
          review?.labFlowsheet[0]?.points.map((p) => p.observedOn),
        ).toEqual(['2026-06-02', '2026-07-26']);
        expect(review?.labFlowsheet[0]?.deltaText).toBe(
          '-1.2 g/dL since 02 Jun 2026',
        );
        expect(review?.interval.reopenedOrNewConflictsCount).toBe(0);
        const fact = review!.interval.pendingInvestigations.find(
          (f) => f.documentId === documentId,
        )!;
        const provenance = await getProvenance(q, fact.evidenceFactId);
        expect(provenance?.fact.verbatimQuote).toBe('Awaiting IHC report');
        expect(provenance?.spans[0]).toMatchObject({
          pageNumber: 1,
          text: 'Awaiting IHC report',
        });
        expect(provenance?.state).toBe('extracted');
      },
    );
  });
  it('keeps unrelated dates unflagged and counts the real same-day conflict once', async () => {
    await withTenant(
      { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' },
      async (q) => {
        const patientId = await newPatient(q);
        const oldDocument = await ingest(q, patientId, '02 June 2026', '11.4');
        await ingest(q, patientId, '26 July 2026', '10.2');
        await ingest(q, patientId, '26 July 2026', '13.8');
        const review = await getLongitudinalReview(q, patientId);
        expect(review?.interval.reopenedOrNewConflictsCount).toBe(1);
        expect(review?.labFlowsheet[0]?.deltaText).toBeNull();
        expect(
          review?.labFlowsheet[0]?.points.find(
            (p) => p.documentId === oldDocument,
          )?.state,
        ).toBe('extracted');
        expect(
          review?.labFlowsheet[0]?.points.filter(
            (p) => p.state === 'conflicting',
          ),
        ).toHaveLength(2);
      },
    );
  });
  it('returns no patient or source facts across tenant boundaries', async () => {
    const result = await withTenant(
      { orgId: fx.org2, userId: null, role: null },
      (q) => getLongitudinalReview(q, fx.patients.demo3),
    );
    expect(result).toBeNull();
  });
  it('uses an approved packet timestamp and ledger position only when no consultation date is recorded', async () => {
    await withTenant(
      { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' },
      async (q) => {
        const patientId = await newPatient(q);
        await q.query(
          'UPDATE patient SET last_consultation_date = NULL WHERE id = $1',
          [patientId],
        );
        // Existing packet approval service is exercised in the ledger regression suite.
        const { createPacket, approvePacket } =
          await import('../src/services/packets');
        const { packetId } = await createPacket(q, {
          orgId: fx.org1,
          patientId,
          userId: fx.clinicians.clinician,
          encounterLabel: 'Synthetic baseline',
        });
        await approvePacket(q, { packetId, userId: fx.clinicians.clinician });
        const result = await getLongitudinalReview(q, patientId);
        expect(result?.interval.baselineDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(result?.interval.newFacts).toEqual([]);
        expect(result?.interval.newDocumentsCount).toBe(0);
      },
    );
  });
  it('ingests a real multi-page PDF without losing page order, empty pages or source dates', async () => {
    await withTenant(
      { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' },
      async (q) => {
        const patientId = await newPatient(q);
        const objects = new Map<string, Buffer>();
        const memory: StoragePort = {
          async put(key, bytes) {
            objects.set(key, bytes);
            return { sha256: createHash('sha256').update(bytes).digest('hex') };
          },
          async get(key) {
            const bytes = objects.get(key);
            if (!bytes) throw new Error('missing');
            return bytes;
          },
          async presignGet() {
            return '';
          },
          async delete(key) {
            objects.delete(key);
          },
        };
        const bytes = buildSyntheticPdf([
          ['Date: 02 June 2026', 'Hemoglobin: 11.4 g/dL'],
          [],
          [
            'Date: 26 July 2026',
            'Hemoglobin: 10.2 g/dL',
            'Bring prior imaging CD',
          ],
        ]);
        const { documentId } = await createDocument(q, memory, {
          orgId: fx.org1,
          patientId,
          uploadedBy: fx.clinicians.clinician,
          filename: 'synthetic-serial-lab.pdf',
          mimeType: 'application/pdf',
          content: bytes,
          sourceKind: 'upload',
          isDemoFixture: true,
        });
        const result = await ingestDocument(
          q,
          {
            storage: memory,
            ocr: new LocalMultimodalOcrAdapter(),
            extractor: new RuleBasedExtractor(),
          },
          documentId,
        );
        expect(result.status).toBe('ready');
        expect(result.pages).toBe(3);
        const review = await getLongitudinalReview(q, patientId);
        expect(
          review?.labFlowsheet[0]?.points.map((p) => [
            p.observedOn,
            p.pageNumber,
          ]),
        ).toEqual([
          ['2026-06-02', 1],
          ['2026-07-26', 3],
        ]);
        expect(review?.interval.documentedInstructions[0]?.pageNumber).toBe(3);
        const pages = await q.query(
          'SELECT page_number, plain_text FROM document_page WHERE document_id = $1 ORDER BY page_number',
          [documentId],
        );
        expect(pages.rows.map((p) => p.page_number)).toEqual([1, 2, 3]);
        expect(pages.rows[1]?.plain_text).toBe('');
      },
    );
  });
});
