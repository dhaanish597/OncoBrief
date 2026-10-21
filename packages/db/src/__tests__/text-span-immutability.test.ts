import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools } from '../../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from '../../test/helpers';

describe('Layer 1: text_span immutability enforcement', () => {
  let fx: Fixtures;

  beforeAll(async () => {
    fx = await setupFixtures();
  }, 120_000);

  afterAll(async () => {
    await closePools();
  });

  it('inserts document, document_page, and text_span as oncobrief_app successfully', async () => {
    const client = await appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
    const docId = randomUUID();
    const pageId = randomUUID();
    const spanId = randomUUID();

    // 1. Insert document
    await client.query(
      `INSERT INTO document (
        id, org_id, patient_id, source_kind, original_filename,
        mime_type, byte_size, content_sha256, storage_key, uploaded_by
      ) VALUES (
        $1, $2, $3, 'upload', 'test.pdf',
        'application/pdf', 1024, decode('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', 'hex'), $4, $5
      )`,
      [docId, fx.org1, fx.patients.demo1, `org/${fx.org1}/${docId}.pdf`, fx.clinicians.clinician],
    );

    // 2. Insert document_page
    await client.query(
      `INSERT INTO document_page (
        id, org_id, document_id, page_number, width_px, height_px, plain_text
      ) VALUES (
        $1, $2, $3, 1, 800, 1100, 'Test page content'
      )`,
      [pageId, fx.org1, docId],
    );

    // 3. Insert text_span
    const res = await client.query(
      `INSERT INTO text_span (
        id, org_id, document_id, page_id, granularity, span_index,
        text, char_start, char_end, bbox_x, bbox_y, bbox_w, bbox_h,
        ocr_confidence, ocr_engine, ocr_engine_version
      ) VALUES (
        $1, $2, $3, $4, 'line', 0,
        'Original text span', 0, 18, 0.1, 0.1, 0.8, 0.05,
        0.98, 'sarvam', 'v1'
      ) RETURNING id`,
      [spanId, fx.org1, docId, pageId],
    );

    expect(res.rows[0]?.id).toBe(spanId);

    // 4. Test Case 2: UPDATE text_span fails with SQLSTATE 42501
    await expect(
      client.query(`UPDATE text_span SET text = 'mutated' WHERE id = $1`, [spanId]),
    ).rejects.toMatchObject({
      code: '42501',
    });

    // 5. Test Case 3: DELETE text_span while parent document_page exists fails with SQLSTATE 42501
    await expect(
      client.query(`DELETE FROM text_span WHERE id = $1`, [spanId]),
    ).rejects.toMatchObject({
      code: '42501',
    });

    await client.end();
  });
});
