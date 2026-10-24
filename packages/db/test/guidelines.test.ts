import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import {
  searchGuidelineSpans,
  getGuidelineDocument,
  listActiveGuidelineDocuments,
  getGuidelineSpan,
} from '../src/services/guidelines';

let fx: Fixtures;
let activeGuidelineId: string;
let inactiveGuidelineId: string;
let span1Id: string;
let span2Id: string;

async function org1Client(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
}

async function org2Client(): Promise<Client> {
  return appClientForOrg(fx.org2, null, null);
}

beforeAll(async () => {
  fx = await setupFixtures();
  const c = await org1Client();
  try {
    // Insert active oncology guideline document
    const activeDoc = await c.query<{ id: string }>(
      `INSERT INTO guideline_document
         (org_id, code, title, issuing_body, version_label, publication_date, content_sha256, is_active, uploaded_by)
       VALUES
         ($1, 'ncg-breast-guideline', 'National Cancer Grid — Breast Cancer Clinical Practice Guidelines',
          'National Cancer Grid (NCG)', 'v2025.2', '2025-03-01', $2, true, $3)
       RETURNING id`,
      [fx.org1, Buffer.alloc(32, 10), fx.clinicians.clinician],
    );
    activeGuidelineId = activeDoc.rows[0]!.id;

    // Insert spans for active guideline
    const s1 = await c.query<{ id: string }>(
      `INSERT INTO guideline_span
         (org_id, guideline_document_id, page_number, section_heading, span_index, verbatim_text, bbox_x, bbox_y, bbox_w, bbox_h, keywords)
       VALUES
         ($1, $2, 4, '4.2 Multidisciplinary Tumor Board Preparation', 0,
          'All complex breast oncology cases must undergo multidisciplinary tumor board review with verified pathology, IHC biomarkers (ER, PR, HER2-neu), and staging imaging before definitive surgical or systemic therapy initiation.',
          0.05, 0.15, 0.90, 0.12, ARRAY['tumor-board', 'multidisciplinary', 'breast', 'biomarkers', 'ihc', 'checklist'])
       RETURNING id`,
      [fx.org1, activeGuidelineId],
    );
    span1Id = s1.rows[0]!.id;

    const s2 = await c.query<{ id: string }>(
      `INSERT INTO guideline_span
         (org_id, guideline_document_id, page_number, section_heading, span_index, verbatim_text, bbox_x, bbox_y, bbox_w, bbox_h, keywords)
       VALUES
         ($1, $2, 8, '8.1 Adjuvant Radiotherapy Documentation', 1,
          'Following modified radical mastectomy for high-risk tumors, post-mastectomy radiation therapy (PMRT) documentation must record total dose (typically 50 Gy in 25 fractions), target volume, and completion summary date.',
          0.05, 0.30, 0.90, 0.10, ARRAY['radiotherapy', 'radiation', 'pmrt', 'mastectomy', 'adjuvant', 'dose'])
       RETURNING id`,
      [fx.org1, activeGuidelineId],
    );
    span2Id = s2.rows[0]!.id;

    // Insert inactive (retired/superseded) guideline document
    const inactiveDoc = await c.query<{ id: string }>(
      `INSERT INTO guideline_document
         (org_id, code, title, issuing_body, version_label, publication_date, content_sha256, is_active, uploaded_by)
       VALUES
         ($1, 'ncg-breast-guideline-legacy', 'NCG Breast Cancer Guidelines (Retired)',
          'National Cancer Grid (NCG)', 'v2020.1', '2020-01-01', $2, false, $3)
       RETURNING id`,
      [fx.org1, Buffer.alloc(32, 11), fx.clinicians.clinician],
    );
    inactiveGuidelineId = inactiveDoc.rows[0]!.id;

    await c.query(
      `INSERT INTO guideline_span
         (org_id, guideline_document_id, page_number, section_heading, span_index, verbatim_text, bbox_x, bbox_y, bbox_w, bbox_h, keywords)
       VALUES
         ($1, $2, 1, 'Historical section', 0,
          'Legacy retired recommendation: tumor board documentation checklist from 2020.',
          0.05, 0.10, 0.90, 0.10, ARRAY['tumor-board', 'legacy', 'checklist'])`,
      [fx.org1, inactiveGuidelineId],
    );
  } finally {
    await c.end();
  }
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Oncology Guideline Retrieval Service', () => {
  it('retrieves active approved guideline spans matching search query', async () => {
    const c = await org1Client();
    try {
      const results = await searchGuidelineSpans(c, fx.org1, 'tumor board checklist');
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((r) => r.spanId === span1Id);
      expect(match).toBeDefined();
      expect(match?.guidelineTitle).toContain('National Cancer Grid');
      expect(match?.versionLabel).toBe('v2025.2');
      expect(match?.sectionHeading).toBe('4.2 Multidisciplinary Tumor Board Preparation');
      expect(match?.pageNumber).toBe(4);
      expect(match?.verbatimText).toContain('multidisciplinary tumor board review');
      expect(match?.bbox).toEqual({ x: 0.05, y: 0.15, w: 0.90, h: 0.12 });
    } finally {
      await c.end();
    }
  });

  it('excludes inactive / retired guideline versions from reference search', async () => {
    const c = await org1Client();
    try {
      const results = await searchGuidelineSpans(c, fx.org1, 'legacy retired recommendation');
      expect(results.length).toBe(0);
    } finally {
      await c.end();
    }
  });

  it('enforces tenant isolation and rejects cross-tenant searches', async () => {
    const c2 = await org2Client();
    try {
      // Tenant 2 searching for tenant 1 guideline spans
      const results = await searchGuidelineSpans(c2, fx.org2, 'multidisciplinary tumor board');
      expect(results.length).toBe(0);

      // Attempting to look up tenant 1 guideline document directly
      const doc = await getGuidelineDocument(c2, fx.org2, activeGuidelineId);
      expect(doc).toBeNull();

      // Attempting to look up tenant 1 span directly
      const span = await getGuidelineSpan(c2, fx.org2, span1Id);
      expect(span).toBeNull();
    } finally {
      await c2.end();
    }
  });

  it('retrieves radiation follow-up guideline passage by clinical keywords', async () => {
    const c = await org1Client();
    try {
      const results = await searchGuidelineSpans(c, fx.org1, 'post-mastectomy radiation therapy PMRT documentation');
      expect(results.length).toBeGreaterThan(0);
      const match = results.find((r) => r.spanId === span2Id);
      expect(match).toBeDefined();
      expect(match?.pageNumber).toBe(8);
      expect(match?.verbatimText).toContain('post-mastectomy radiation therapy');
      expect(match?.verbatimText).toContain('50 Gy in 25 fractions');
    } finally {
      await c.end();
    }
  });

  it('lists only active guideline documents for the tenant', async () => {
    const c = await org1Client();
    try {
      const activeDocs = await listActiveGuidelineDocuments(c, fx.org1);
      const activeIds = activeDocs.map((d) => d.id);
      expect(activeIds).toContain(activeGuidelineId);
      expect(activeIds).not.toContain(inactiveGuidelineId);
    } finally {
      await c.end();
    }
  });

  it('returns empty array when search query matches nothing without error', async () => {
    const c = await org1Client();
    try {
      const results = await searchGuidelineSpans(c, fx.org1, 'completely nonexistent term xyz12345');
      expect(results).toEqual([]);
    } finally {
      await c.end();
    }
  });
});
