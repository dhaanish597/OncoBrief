import type { Querier } from '../client';

export interface GuidelineDocumentRow {
  id: string;
  orgId: string;
  code: string;
  title: string;
  issuingBody: string;
  versionLabel: string;
  publicationDate: string;
  contentSha256: string;
  isActive: boolean;
  uploadedBy: string;
  uploadedAt: string;
}

export interface GuidelineSpanSearchResult {
  spanId: string;
  guidelineDocumentId: string;
  guidelineCode: string;
  guidelineTitle: string;
  issuingBody: string;
  versionLabel: string;
  publicationDate: string;
  pageNumber: number;
  sectionHeading: string;
  spanIndex: number;
  verbatimText: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  keywords: string[];
  score: number;
}

export interface SearchGuidelineOptions {
  maxResults?: number;
  guidelineCode?: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'show', 'what', 'find', 'which', 'where', 'how',
  'does', 'from', 'this', 'that', 'about', 'please', 'tell', 'guideline', 'guidelines',
  'hospital', 'institutional', 'section', 'exact', 'passage', 'concerning', 'documentation',
]);

export async function searchGuidelineSpans(
  q: Querier,
  orgId: string,
  query: string,
  options?: SearchGuidelineOptions,
): Promise<GuidelineSpanSearchResult[]> {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) return [];

  const tokens = cleanQuery
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, ''))
    .filter((t) => t.length >= 2)
    .filter((t) => !STOP_WORDS.has(t));

  const maxResults = options?.maxResults ?? 8;

  // Retrieve active guideline spans for this tenant
  const sql = `
    SELECT
      gs.id AS span_id,
      gs.guideline_document_id,
      gd.code AS guideline_code,
      gd.title AS guideline_title,
      gd.issuing_body,
      gd.version_label,
      gd.publication_date::text AS publication_date,
      gs.page_number,
      gs.section_heading,
      gs.span_index,
      gs.verbatim_text,
      gs.bbox_x,
      gs.bbox_y,
      gs.bbox_w,
      gs.bbox_h,
      gs.keywords
    FROM guideline_span gs
    JOIN guideline_document gd ON gd.id = gs.guideline_document_id AND gd.org_id = gs.org_id
    WHERE gd.org_id = $1
      AND gd.is_active = true
      ${options?.guidelineCode ? 'AND gd.code = $2' : ''}
    ORDER BY gs.page_number, gs.span_index
  `;

  const params: unknown[] = [orgId];
  if (options?.guidelineCode) {
    params.push(options.guidelineCode);
  }

  const res = await q.query<{
    span_id: string;
    guideline_document_id: string;
    guideline_code: string;
    guideline_title: string;
    issuing_body: string;
    version_label: string;
    publication_date: string;
    page_number: number;
    section_heading: string;
    span_index: number;
    verbatim_text: string;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    keywords: string[];
  }>(sql, params);

  if (res.rows.length === 0) return [];

  // Deterministic scoring based on term frequency across verbatim text, section heading, keywords and title
  const scored = res.rows.map((row) => {
    let score = 0;
    const textLower = row.verbatim_text.toLowerCase();
    const headingLower = row.section_heading.toLowerCase();
    const titleLower = row.guideline_title.toLowerCase();
    const keywordsLower = (row.keywords || []).map((k) => k.toLowerCase());

    // Whole phrase match gets huge bonus
    if (tokens.length > 1 && textLower.includes(cleanQuery)) {
      score += 20;
    }

    for (const token of tokens) {
      if (headingLower.includes(token)) score += 5;
      if (keywordsLower.some((k) => k.includes(token))) score += 4;
      if (titleLower.includes(token)) score += 3;
      if (textLower.includes(token)) {
        score += 2;
        // Count repeated matches in text
        const matches = textLower.split(token).length - 1;
        score += Math.min(matches, 5);
      }
    }

    return { row, score };
  });

  const matching = scored.filter((s) => s.score > 0);
  matching.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.row.page_number !== b.row.page_number) return a.row.page_number - b.row.page_number;
    return a.row.span_index - b.row.span_index;
  });

  return matching.slice(0, maxResults).map(({ row, score }) => ({
    spanId: row.span_id,
    guidelineDocumentId: row.guideline_document_id,
    guidelineCode: row.guideline_code,
    guidelineTitle: row.guideline_title,
    issuingBody: row.issuing_body,
    versionLabel: row.version_label,
    publicationDate: row.publication_date,
    pageNumber: row.page_number,
    sectionHeading: row.section_heading,
    spanIndex: row.span_index,
    verbatimText: row.verbatim_text,
    bbox: {
      x: row.bbox_x,
      y: row.bbox_y,
      w: row.bbox_w,
      h: row.bbox_h,
    },
    keywords: row.keywords || [],
    score,
  }));
}

export async function getGuidelineDocument(
  q: Querier,
  orgId: string,
  id: string,
): Promise<GuidelineDocumentRow | null> {
  const res = await q.query<{
    id: string;
    org_id: string;
    code: string;
    title: string;
    issuing_body: string;
    version_label: string;
    publication_date: string;
    content_sha256: Buffer;
    is_active: boolean;
    uploaded_by: string;
    uploaded_at: Date;
  }>(
    `SELECT id, org_id, code, title, issuing_body, version_label,
            publication_date::text AS publication_date, content_sha256,
            is_active, uploaded_by, uploaded_at
       FROM guideline_document
      WHERE org_id = $1 AND id = $2`,
    [orgId, id],
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    orgId: r.org_id,
    code: r.code,
    title: r.title,
    issuingBody: r.issuing_body,
    versionLabel: r.version_label,
    publicationDate: r.publication_date,
    contentSha256: r.content_sha256.toString('hex'),
    isActive: r.is_active,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at.toISOString(),
  };
}

export async function listActiveGuidelineDocuments(
  q: Querier,
  orgId: string,
): Promise<GuidelineDocumentRow[]> {
  const res = await q.query<{
    id: string;
    org_id: string;
    code: string;
    title: string;
    issuing_body: string;
    version_label: string;
    publication_date: string;
    content_sha256: Buffer;
    is_active: boolean;
    uploaded_by: string;
    uploaded_at: Date;
  }>(
    `SELECT id, org_id, code, title, issuing_body, version_label,
            publication_date::text AS publication_date, content_sha256,
            is_active, uploaded_by, uploaded_at
       FROM guideline_document
      WHERE org_id = $1 AND is_active = true
      ORDER BY title, version_label`,
    [orgId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    code: r.code,
    title: r.title,
    issuingBody: r.issuing_body,
    versionLabel: r.version_label,
    publicationDate: r.publication_date,
    contentSha256: r.content_sha256.toString('hex'),
    isActive: r.is_active,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at.toISOString(),
  }));
}

export async function getGuidelineSpan(
  q: Querier,
  orgId: string,
  spanId: string,
): Promise<GuidelineSpanSearchResult | null> {
  const res = await q.query<{
    span_id: string;
    guideline_document_id: string;
    guideline_code: string;
    guideline_title: string;
    issuing_body: string;
    version_label: string;
    publication_date: string;
    page_number: number;
    section_heading: string;
    span_index: number;
    verbatim_text: string;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    keywords: string[];
  }>(
    `SELECT
       gs.id AS span_id,
       gs.guideline_document_id,
       gd.code AS guideline_code,
       gd.title AS guideline_title,
       gd.issuing_body,
       gd.version_label,
       gd.publication_date::text AS publication_date,
       gs.page_number,
       gs.section_heading,
       gs.span_index,
       gs.verbatim_text,
       gs.bbox_x,
       gs.bbox_y,
       gs.bbox_w,
       gs.bbox_h,
       gs.keywords
     FROM guideline_span gs
     JOIN guideline_document gd ON gd.id = gs.guideline_document_id AND gd.org_id = gs.org_id
     WHERE gs.org_id = $1 AND gs.id = $2`,
    [orgId, spanId],
  );
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  return {
    spanId: row.span_id,
    guidelineDocumentId: row.guideline_document_id,
    guidelineCode: row.guideline_code,
    guidelineTitle: row.guideline_title,
    issuingBody: row.issuing_body,
    versionLabel: row.version_label,
    publicationDate: row.publication_date,
    pageNumber: row.page_number,
    sectionHeading: row.section_heading,
    spanIndex: row.span_index,
    verbatimText: row.verbatim_text,
    bbox: {
      x: row.bbox_x,
      y: row.bbox_y,
      w: row.bbox_w,
      h: row.bbox_h,
    },
    keywords: row.keywords || [],
    score: 1,
  };
}
