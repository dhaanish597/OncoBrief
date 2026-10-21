/**
 * Deployed API Security & Smoke Test Matrix (pnpm smoke:api — 11/11 Gate)
 *
 * Verifies all 11 assertions required by ONCOBRIEF_V3_BUILD_AND_TEST_PLAN.md:
 * 1. POST /api/v1/patients/[id]/documents/upload-url without auth -> 401
 * 2. POST /api/v1/patients/[id]/documents/upload-url with unauthorized role -> 403
 * 3. POST /api/v1/patients/not-a-uuid/documents/upload-url -> 400
 * 4. POST /api/v1/patients/[id]/documents/upload-url with malformed JSON body -> 400
 * 5. POST /api/v1/patients/[id]/documents/upload-url with unsupported contentType: "application/x-msdownload" -> 400
 * 6. POST /api/v1/patients/[id]/documents/upload-url with sizeBytes: 30000000 (>25 MB) -> 413
 * 7. POST /api/v1/patients/[id]/documents/upload-url with valid payload when STORAGE_DRIVER=fs -> 501
 * 8. GET /api/v1/storage/local with valid presigned HMAC query params and document:read_page permission -> 200 OK
 * 9. GET /api/v1/storage/local with expired timestamp, tampered sig, or key=../../etc/passwd -> 403 FORBIDDEN
 * 10. GET /api/v1/patients/[id]/documents/[documentId]/pages/1 with Bearer token & RBAC check -> 200 OK
 * 11. GET /api/v1/evidence/[id] -> 200 OK with non-null presigned documentUrl in STORAGE_DRIVER=fs mode
 */

const BASE = (
  process.env['SMOKE_BASE_URL'] ??
  process.env['E2E_BASE_URL'] ??
  'http://localhost:3000'
).replace(/\/$/, '');

const CLINICIAN_EMAIL = process.env['SMOKE_EMAIL'] ?? 'dr.rao@rci.demo';
const AUDITOR_EMAIL = 'auditor.k@rci.demo';
const PASSWORD = process.env['SMOKE_PASSWORD'] ?? 'oncobrief-demo';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

interface Result {
  id: number;
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
const check = (id: number, name: string, ok: boolean, detail = ''): void => {
  results.push({ id, name, ok, detail });
};

async function signIn(email: string): Promise<{ cookie: string; token: string }> {
  const loginPage = await fetch(`${BASE}/login`);
  if (!loginPage.ok) throw new Error(`GET /login -> HTTP ${loginPage.status}`);
  const html = await loginPage.text();
  const actionId = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  if (!actionId) throw new Error('could not find the login server-action id in /login');

  const form = new FormData();
  form.set(actionId, '');
  form.set('email', email);
  form.set('password', PASSWORD);

  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: { origin: BASE },
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies
    .map((c) => c.split(';')[0])
    .find((c) => c && c.startsWith('ob_session='));
  if (!sessionCookie) {
    throw new Error(
      `sign-in failed for ${email} (HTTP ${res.status}; cookies: ${cookies.length})`,
    );
  }
  const token = sessionCookie.replace('ob_session=', '');
  return { cookie: sessionCookie, token };
}

async function get(path: string, cookie?: string, headers?: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(headers ?? {}),
    },
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function postJson(
  path: string,
  body: unknown,
  cookie?: string,
  headers?: Record<string, string>,
) {
  const isString = typeof body === 'string';
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(headers ?? {}),
    },
    body: isString ? (body as string) : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function main(): Promise<void> {
  console.log(`Starting API Smoke & Security Gate against ${BASE}...\n`);

  // Sign in as clinician (has document:upload, document:read_page)
  const clinician = await signIn(CLINICIAN_EMAIL);
  console.log(`Signed in as clinician: ${CLINICIAN_EMAIL}`);

  // Sign in as auditor (has document:read_page, but NOT document:upload)
  const auditor = await signIn(AUDITOR_EMAIL);
  console.log(`Signed in as auditor: ${AUDITOR_EMAIL}`);

  // Discover patient ID, document ID, and fact ID
  const workspace = await get('/workspace', clinician.cookie);
  const patientId = workspace.text.match(new RegExp(`/patients/(${UUID})/`))?.[1];
  if (!patientId) throw new Error('No patient found on /workspace');

  const evidencePage = await get(`/patients/${patientId}/evidence`, clinician.cookie);
  const factId = evidencePage.text.match(new RegExp(`[?&]fact=(${UUID})`))?.[1];
  if (!factId) throw new Error('No fact id found on /patients/[id]/evidence');

  const evCheck = await get(`/api/v1/evidence/${factId}`, clinician.cookie);
  if (evCheck.status !== 200) throw new Error(`GET /api/v1/evidence/${factId} -> ${evCheck.status}`);
  const evData = JSON.parse(evCheck.text);
  const documentId = evData.source?.document_id;
  if (!documentId) throw new Error('No document_id found in evidence fact');

  console.log(`Discovered test fixture: Patient ${patientId}, Document ${documentId}, Fact ${factId}\n`);

  // --- ASSERTION 1 ---
  const a1 = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'test.pdf', contentType: 'application/pdf', sizeBytes: 1024 },
  );
  check(1, 'POST upload-url without auth -> 401', a1.status === 401, `status=${a1.status}`);

  // --- ASSERTION 2 ---
  const a2 = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'test.pdf', contentType: 'application/pdf', sizeBytes: 1024 },
    auditor.cookie,
  );
  check(2, 'POST upload-url with unauthorized role -> 403', a2.status === 403, `status=${a2.status}`);

  // --- ASSERTION 3 ---
  const a3 = await postJson(
    `/api/v1/patients/not-a-uuid/documents/upload-url`,
    { filename: 'test.pdf', contentType: 'application/pdf', sizeBytes: 1024 },
    clinician.cookie,
  );
  check(3, 'POST upload-url with invalid patient UUID -> 400', a3.status === 400, `status=${a3.status}`);

  // --- ASSERTION 4 ---
  const a4 = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    '{malformed-json',
    clinician.cookie,
  );
  check(4, 'POST upload-url with malformed JSON body -> 400', a4.status === 400, `status=${a4.status}`);

  // --- ASSERTION 5 ---
  const a5 = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'malware.exe', contentType: 'application/x-msdownload', sizeBytes: 1024 },
    clinician.cookie,
  );
  check(
    5,
    'POST upload-url with unsupported contentType -> 400',
    a5.status === 400,
    `status=${a5.status}`,
  );

  // --- ASSERTION 6 ---
  const a6 = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'oversized.pdf', contentType: 'application/pdf', sizeBytes: 30000000 },
    clinician.cookie,
  );
  check(
    6,
    'POST upload-url with sizeBytes > 25MB -> 413',
    a6.status === 413,
    `status=${a6.status}`,
  );

  // --- ASSERTION 7 ---
  const a7 = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'valid.pdf', contentType: 'application/pdf', sizeBytes: 1024 },
    clinician.cookie,
  );
  check(
    7,
    'POST upload-url with valid payload when STORAGE_DRIVER=fs -> 501',
    a7.status === 501,
    `status=${a7.status}`,
  );

  // --- ASSERTION 10 ---
  // Verified with Bearer token & RBAC check -> 200 OK containing documentUrl and spans[]
  const a10 = await get(
    `/api/v1/patients/${patientId}/documents/${documentId}/pages/1`,
    undefined,
    { Authorization: `Bearer ${clinician.token}` },
  );
  let parsedPage: { documentUrl?: string; spans?: unknown[] } = {};
  try {
    parsedPage = JSON.parse(a10.text);
  } catch {
    /* non-JSON */
  }
  const hasPageData =
    a10.status === 200 &&
    typeof parsedPage.documentUrl === 'string' &&
    Array.isArray(parsedPage.spans);
  check(
    10,
    'GET /api/v1/patients/[id]/documents/[documentId]/pages/1 with Bearer token & RBAC -> 200 OK with documentUrl and spans[]',
    hasPageData,
    `status=${a10.status}, hasDocUrl=${Boolean(parsedPage.documentUrl)}, spansCount=${parsedPage.spans?.length ?? 0}`,
  );

  // --- ASSERTION 11 ---
  const a11 = await get(`/api/v1/evidence/${factId}`, clinician.cookie);
  let parsedEv: { source?: { document_url?: string } } = {};
  try {
    parsedEv = JSON.parse(a11.text);
  } catch {
    /* non-JSON */
  }
  const hasPresignedDocUrl =
    a11.status === 200 &&
    typeof parsedEv.source?.document_url === 'string' &&
    parsedEv.source.document_url.length > 0;
  check(
    11,
    'GET /api/v1/evidence/[id] -> 200 OK with non-null presigned documentUrl in STORAGE_DRIVER=fs mode',
    hasPresignedDocUrl,
    `status=${a11.status}, docUrl=${parsedEv.source?.document_url?.slice(0, 40)}...`,
  );

  // Use the presigned URL from assertion 10 or 11 for assertions 8 and 9
  const validPresignedUrl = parsedPage.documentUrl ?? parsedEv.source?.document_url;
  if (!validPresignedUrl) {
    throw new Error('Could not obtain valid presigned URL for local storage tests');
  }

  // --- ASSERTION 8 ---
  const a8 = await get(validPresignedUrl, clinician.cookie);
  const is200 = a8.status === 200;
  const hasContentType = Boolean(a8.headers.get('content-type'));
  check(
    8,
    'GET /api/v1/storage/local with valid presigned HMAC query params & RBAC -> 200 OK with Content-Type and stream',
    is200 && hasContentType,
    `status=${a8.status}, contentType=${a8.headers.get('content-type')}`,
  );

  // --- ASSERTION 9 ---
  // Sub-checks: tampered sig, expired timestamp, and path traversal
  const tamperedSigUrl = `${validPresignedUrl.split('&sig=')[0]}&sig=deadbeef00000000000000000000000000000000000000000000000000000000`;
  const a9_tampered = await get(tamperedSigUrl, clinician.cookie);

  const expiredUrl = '/api/v1/storage/local?key=test.pdf&exp=1&sig=deadbeef';
  const a9_expired = await get(expiredUrl, clinician.cookie);

  const traversalUrl = '/api/v1/storage/local?key=../../etc/passwd&exp=9999999999&sig=deadbeef';
  const a9_traversal = await get(traversalUrl, clinician.cookie);

  const allForbidden =
    a9_tampered.status === 403 &&
    a9_expired.status === 403 &&
    a9_traversal.status === 403;

  check(
    9,
    'GET /api/v1/storage/local with expired timestamp, tampered sig, or path traversal -> 403 FORBIDDEN',
    allForbidden,
    `tampered=${a9_tampered.status}, expired=${a9_expired.status}, traversal=${a9_traversal.status}`,
  );

  // Print results
  console.log('='.repeat(80));
  console.log('API Smoke Test Results:');
  console.log('='.repeat(80));
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`[${r.ok ? 'PASS' : 'FAIL'}] #${r.id} ${r.name} (${r.detail})`);
  }
  console.log('='.repeat(80));
  console.log(`Total: ${results.length - failed}/${results.length} assertions passed.\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error running smoke tests:', err);
  process.exitCode = 1;
});
