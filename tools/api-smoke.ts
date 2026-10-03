/**
 * Deployed API smoke test.
 *
 * Unlike `tools/smoke.ts` (which uses the database directly and therefore only
 * runs in-process), this drives the **deployed** application over HTTP exactly
 * as a client would: it performs the real sign-in, then exercises the `/api/v1`
 * surface with and without a session.
 *
 *   SMOKE_BASE_URL=https://<deployed-host> pnpm smoke:api
 *
 * Covers: sign-in, session acquisition, authenticated patient/evidence access,
 * presigned upload-URL issuance, unauthenticated refusal, invalid input, and
 * unknown-resource handling. Cross-tenant isolation itself is asserted by the
 * Postgres integration tests (`packages/db/test`), which can create a second
 * tenant; here the observable guarantee is that an unknown or foreign id yields
 * 404, never 403 (existence is not confirmed).
 */
const BASE = (
  process.env['SMOKE_BASE_URL'] ??
  process.env['E2E_BASE_URL'] ??
  'http://localhost:3000'
).replace(/\/$/, '');
const EMAIL = process.env['SMOKE_EMAIL'] ?? 'dr.rao@rci.demo';
const PASSWORD = process.env['SMOKE_PASSWORD'] ?? 'oncobrief-demo';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}
const results: Result[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail });
};

/**
 * Sign in through the progressively-enhanced login form. Next renders the
 * server action as `<form method="POST" enctype="multipart/form-data">` with a
 * hidden `$ACTION_ID_*` field, so a non-browser client can replay it and receive
 * the session cookie the same way the browser does.
 */
async function signIn(): Promise<string> {
  const loginPage = await fetch(`${BASE}/login`);
  if (!loginPage.ok) throw new Error(`GET /login -> HTTP ${loginPage.status}`);
  const html = await loginPage.text();
  const actionId = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  if (!actionId) throw new Error('could not find the login server-action id in /login');

  const form = new FormData();
  form.set(actionId, '');
  form.set('email', EMAIL);
  form.set('password', PASSWORD);

  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: { origin: BASE },
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('ob_session='));
  if (!session) {
    throw new Error(`sign-in did not establish a session (HTTP ${res.status}; cookies: ${cookies.length})`);
  }
  return session;
}

async function get(path: string, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function postJson(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main(): Promise<void> {
  console.log(`API smoke against ${BASE}\n`);

  const cookie = await signIn();
  check('sign-in establishes a session cookie', true, 'ob_session set');

  const workspace = await get('/workspace', cookie);
  const patientId = workspace.text.match(new RegExp(`/patients/(${UUID})/`))?.[1];
  check('authenticated workspace renders', workspace.status === 200 && Boolean(patientId), `HTTP ${workspace.status}`);
  if (!patientId) throw new Error('no patient id found on /workspace');

  const evidencePage = await get(`/patients/${patientId}/evidence`, cookie);
  const factId = evidencePage.text.match(new RegExp(`[?&]fact=(${UUID})`))?.[1];
  check('evidence journey lists provenance-linked facts', evidencePage.status === 200 && Boolean(factId), `HTTP ${evidencePage.status}`);

  if (factId) {
    const ev = await get(`/api/v1/evidence/${factId}`, cookie);
    let parsed: {
      state?: unknown;
      source?: { verbatim_quote?: unknown; page_number?: unknown };
      extraction?: { kind?: unknown };
    } = {};
    try {
      parsed = JSON.parse(ev.text);
    } catch {
      /* non-JSON */
    }
    const hasProvenance =
      ev.status === 200 &&
      typeof parsed.source?.verbatim_quote === 'string' &&
      parsed.source.verbatim_quote.length > 0 &&
      parsed.extraction?.kind !== undefined;
    check('GET /api/v1/evidence/{id} returns span-anchored provenance', hasProvenance, `HTTP ${ev.status}`);
  }

  const upload = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'smoke-check.pdf', mimeType: 'application/pdf', byteSize: 1024 },
    cookie,
  );
  const uploadBody = upload.text.includes('presigned_url');
  check('POST upload-url issues a presigned PUT', upload.status === 201 && uploadBody, `HTTP ${upload.status}`);

  const noAuth = await fetch(`${BASE}/api/v1/patients/${patientId}/documents/upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'x.pdf', mimeType: 'application/pdf', byteSize: 1 }),
    redirect: 'manual',
  });
  check('unauthenticated upload-url is refused', noAuth.status === 401, `HTTP ${noAuth.status}`);

  const unauthEvidence = await fetch(`${BASE}/api/v1/evidence/${factId ?? '0'.repeat(8)}`, { redirect: 'manual' });
  check('unauthenticated evidence read is refused', unauthEvidence.status === 401, `HTTP ${unauthEvidence.status}`);

  const badJson = await fetch(`${BASE}/api/v1/patients/${patientId}/documents/upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: '{',
    redirect: 'manual',
  });
  check('invalid JSON is rejected', badJson.status === 400, `HTTP ${badJson.status}`);

  const badType = await postJson(
    `/api/v1/patients/${patientId}/documents/upload-url`,
    { filename: 'archive.zip', mimeType: 'application/zip', byteSize: 10 },
    cookie,
  );
  check('unsupported content type is rejected', badType.status === 415, `HTTP ${badType.status}`);

  const foreign = await postJson(
    `/api/v1/patients/${'00000000-0000-4000-8000-000000000000'}/documents/upload-url`,
    { filename: 'x.pdf', mimeType: 'application/pdf', byteSize: 10 },
    cookie,
  );
  check('unknown patient yields 404, not 403', foreign.status === 404, `HTTP ${foreign.status}`);

  const unknownFact = await get(`/api/v1/evidence/${'00000000-0000-4000-8000-000000000000'}`, cookie);
  check('unknown evidence yields 404', unknownFact.status === 404, `HTTP ${unknownFact.status}`);

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
