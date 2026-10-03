/**
 * Branding guard (Health-a-thon 2026 final deployment).
 *
 * The authoritative product name is "OncoBrief". OncoGuide was a separate,
 * patient-facing concept described in the historical research; it must not
 * resurface as the product's name in the shipped application.
 *
 * This scan fails when the old name appears anywhere user-facing — source,
 * metadata, README, deployment configuration — while deliberately allowing the
 * historical documents under `docs/`, where the old concept is discussed as
 * source material. It also asserts that the primary title surfaces actually say
 * "OncoBrief".
 *
 *   pnpm branding:check
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.var',
  '.terraform',
  '.playwright-mcp',
  'test-results',
  'playwright-report',
  'build',
  'dist',
  'coverage',
]);

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot|otf|mp3|wav|mp4|mov|lock|tfstate|heapsnapshot)$/i;

/** Historical / source material where the former concept is legitimately named. */
const HISTORICAL_PREFIX = `docs${sep}`;

/** The guard itself names the old concept in order to detect it. */
const ALLOW_FILES = new Set([join('tools', 'validate-branding.ts')]);

const OLD_NAME = /oncoguide|onco[\s-]+guide/i;
const PRODUCT = 'OncoBrief';

interface Finding {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function scanOldName(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel.startsWith(HISTORICAL_PREFIX)) continue;
    if (ALLOW_FILES.has(rel)) continue;
    if (BINARY.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!OLD_NAME.test(text)) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      if (OLD_NAME.test(line)) findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 160) });
    });
  }
  return findings;
}

interface Assertion {
  file: string;
  needle: string | RegExp;
  why: string;
}

const ASSERTIONS: Assertion[] = [
  { file: 'package.json', needle: /"name"\s*:\s*"oncobrief"/, why: 'workspace package name' },
  { file: 'README.md', needle: /^#\s+OncoBrief\b/m, why: 'README primary heading' },
  { file: join('apps', 'web', 'src', 'app', 'layout.tsx'), needle: /OncoBrief/, why: 'browser tab title metadata' },
  { file: join('apps', 'web', 'src', 'app', 'login', 'page.tsx'), needle: /OncoBrief/, why: 'login screen product name' },
  { file: join('apps', 'web', 'src', 'app', '(app)', 'layout.tsx'), needle: /OncoBrief/, why: 'application header / navigation' },
];

function runAssertions(): string[] {
  const failures: string[] = [];
  for (const a of ASSERTIONS) {
    let text: string;
    try {
      text = readFileSync(join(ROOT, a.file), 'utf8');
    } catch {
      failures.push(`${a.file}: missing (expected the primary product name for ${a.why})`);
      continue;
    }
    const ok = typeof a.needle === 'string' ? text.includes(a.needle) : a.needle.test(text);
    if (!ok) failures.push(`${a.file}: does not present "${PRODUCT}" (${a.why})`);
  }
  return failures;
}

const files = walk(ROOT);
const oldNameFindings = scanOldName(files);
const assertionFailures = runAssertions();

if (oldNameFindings.length === 0 && assertionFailures.length === 0) {
  console.log(`branding scan: clean — "${PRODUCT}" is the only product name in shipped surfaces`);
  process.exit(0);
}

for (const f of assertionFailures) console.error(`FAIL  ${f}`);
for (const f of oldNameFindings) console.error(`FAIL  ${f.file}:${f.line}  ${f.text}`);
console.error(
  `\nbranding scan: ${oldNameFindings.length + assertionFailures.length} problem(s). ` +
    `Historical references under docs/ are allowed; user-facing references are not.`,
);
process.exit(1);
