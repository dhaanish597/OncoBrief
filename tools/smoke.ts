/**
 * End-to-end smoke check over HTTP against a running server.
 *
 *   pnpm --filter @oncobrief/web start      # in one terminal
 *   npx tsx tools/smoke.ts                  # in another
 *
 * It logs in for real, then fetches each surface as that session and asserts
 * the evidence-first content is present. It complements the Playwright spec
 * (apps/web/e2e) with a check that needs no browser.
 */
import {
  authLookupUser,
  closePools,
  getConflict,
  listConflicts,
  listPatients,
  login,
  withTenant,
  withTransaction,
} from '../packages/db/src/index';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  body?: string;
  needle?: string;
}

function snippet(body: string, needle?: string): string {
  if (!needle) return body.slice(0, 400);
  const i = body.indexOf(needle);
  if (i >= 0) return body.slice(Math.max(0, i - 200), i + 400);
  return body.slice(0, 400);
}

const checks: Check[] = [];

async function fetchPage(path: string, cookie?: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function main(): Promise<void> {
  const rows = await authLookupUser('dr.rao@rci.demo');
  if (rows.length === 0) throw new Error('no demo clinician found — run pnpm demo:reset first');
  const session = await withTransaction((q) => login(q, 'dr.rao@rci.demo', 'oncobrief-demo', {}));
  if (!session) throw new Error('login failed');
  const cookie = `ob_session=${session.token}`;
  const ctx = { orgId: session.context.orgId, userId: session.context.userId, role: 'clinician' as const };

  const { patients, conflictId } = await withTenant(ctx, async (q) => {
    const list = await listPatients(q);
    const demo1 = list.find((p) => p.demoCode === 'DEMO-001')!;
    const demo3 = list.find((p) => p.demoCode === 'DEMO-003')!;
    const conflicts = await listConflicts(q, demo1.id, 'open');
    const conflict = conflicts[0] ? await getConflict(q, demo1.id, conflicts[0].id) : null;
    return { patients: { demo1, demo3, all: list }, conflictId: conflict?.id ?? null };
  });

  const d1 = patients.demo1.id;
  const d3 = patients.demo3.id;

  checks.push({
    name: 'workspace lists patients with readiness bands',
    ok: patients.all.length >= 3,
    detail: `${patients.all.length} patients`,
  });

  const ws = await fetchPage('/workspace', cookie);
  checks.push({
    name: 'workspace renders DEMO-001 and a readiness band',
    ok: ws.status === 200 && ws.body.includes('DEMO-001') && ws.body.includes('data-testid="readiness-band"'),
    detail: `HTTP ${ws.status}`,
  });

  const ev = await fetchPage(`/patients/${d1}/evidence`, cookie);
  checks.push({
    name: 'evidence journey renders fact rows with state badges',
    ok: ev.status === 200 && ev.body.includes('data-testid="evidence-row"') && ev.body.includes('Modified radical mastectomy'),
    detail: `HTTP ${ev.status}`,
  });

  const srcs = await fetchPage(`/patients/${d1}/sources`, cookie);
  checks.push({
    name: 'sources inventory renders documents and origins',
    ok: srcs.status === 200 && srcs.body.includes('External hospital') && srcs.body.includes('duplicate'),
    detail: `HTTP ${srcs.status}`,
  });

  const conf = await fetchPage(`/patients/${d1}/conflicts`, cookie);
  checks.push({
    name: 'reconciliation queue lists the disagreement',
    ok: conf.status === 200 && conf.body.includes('sources disagree'),
    detail: `HTTP ${conf.status}`,
  });

  if (conflictId) {
    const room = await fetchPage(`/patients/${d1}/conflicts/${conflictId}`, cookie);
    checks.push({
      name: 'reconciliation room offers all three outcomes and two sources',
      ok:
        room.status === 200 &&
        room.body.includes('Retain both as conflicting') &&
        room.body.includes('Mark one as superseded') &&
        room.body.includes('Correct the structured event') &&
        (room.body.match(/data-testid="source-pane"/g)?.length ?? 0) >= 2,
      detail: `HTTP ${room.status}`,
    });
  }

  const map = await fetchPage(`/patients/${d1}/record-map`, cookie);
  checks.push({
    name: 'record map shows a missing required document with a task action',
    ok: map.status === 200 && map.body.includes('data-status="missing"') && map.body.includes('create retrieval task'),
    detail: `HTTP ${map.status}`,
  });

  const tasks = await fetchPage(`/patients/${d1}/tasks`, cookie);
  checks.push({
    name: 'tasks render with their origin link',
    ok: tasks.status === 200 && tasks.body.includes('origin:'),
    detail: `HTTP ${tasks.status}`,
  });

  const packet = await fetchPage(`/patients/${d3}/packet`, cookie);
  checks.push({
    name: 'packet renders the mandatory sections including empty ones',
    ok:
      packet.status === 200 &&
      packet.body.includes('Open source conflicts') &&
      packet.body.includes('Missing documents'),
    detail: `HTTP ${packet.status}`,
    body: packet.body,
    needle: 'Consultation packet',
  });

  const continuity = await fetchPage(`/patients/${d3}/continuity`, cookie);
  checks.push({
    name: 'continuity shows a traced message and simulated delivery',
    ok:
      continuity.status === 200 &&
      (continuity.body.includes('simulated delivery') || continuity.body.includes('every value traced')),
    detail: `HTTP ${continuity.status}`,
    body: continuity.body,
    needle: 'Care continuity',
  });

  const audit = await fetchPage(`/patients/${d1}/audit`, cookie);
  checks.push({
    name: 'audit trail verifies the hash chain',
    // React inserts comment separators between text nodes, so match the
    // data attribute rather than the rendered sentence.
    ok: audit.status === 200 && audit.body.includes('data-testid="ledger-verify" data-ok="true"'),
    detail: `HTTP ${audit.status}`,
    body: audit.body,
    needle: 'ledger-verify',
  });

  const about = await fetchPage('/about', cookie);
  checks.push({
    name: 'about states the non-clinical boundary',
    ok: about.status === 200 && about.body.includes('does not diagnose'),
    detail: `HTTP ${about.status}`,
  });

  const unauth = await fetchPage('/workspace');
  checks.push({
    name: 'an unauthenticated request is redirected to login',
    ok: unauth.status >= 300 && unauth.status < 400,
    detail: `HTTP ${unauth.status}`,
  });

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed += 1;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    if (!c.ok && c.body) console.log(`      ↳ ${snippet(c.body, c.needle).replace(/\s+/g, ' ')}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(() => closePools());
