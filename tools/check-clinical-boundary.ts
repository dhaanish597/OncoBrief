/**
 * Clinical-boundary scan (architecture §18.1).
 *
 * CI-failing check that scans system-authored string tables and identifiers
 * across the repository for forbidden clinical concepts, using the domain
 * package's own single source of truth (`scanForBoundaryViolation`).
 *
 *   node --import tsx tools/check-clinical-boundary.ts
 *
 * The scan looks at the closed vocabularies and the UI string tables, not at
 * fixture document text (a document may legitimately contain the word
 * "prognosis"; the system may not compute one).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  FACT_TYPE_LABEL,
  TASK_KIND_LABEL,
  DOCUMENT_TYPE_LABEL,
  EVIDENCE_STATE_LABEL,
  PACKET_SECTION_LABEL,
  READINESS_BAND_LABEL,
  scanForBoundaryViolation,
} from '../packages/domain/src/index.js';

const root = process.cwd();
const SCAN_DIRS = ['packages', 'apps'];
const SOURCE_EXT = /\.(ts|tsx)$/;
const IGNORE = /(node_modules|\.next|dist|test|__tests__|fixtures?)/;

const registryStrings: [string, string][] = [
  ...Object.entries(FACT_TYPE_LABEL),
  ...Object.entries(TASK_KIND_LABEL),
  ...Object.entries(DOCUMENT_TYPE_LABEL),
  ...Object.entries(EVIDENCE_STATE_LABEL),
  ...Object.entries(PACKET_SECTION_LABEL),
  ...Object.entries(READINESS_BAND_LABEL),
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (IGNORE.test(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(full)) out.push(full);
  }
  return out;
}

const violations: string[] = [];

for (const [key, value] of registryStrings) {
  for (const v of scanForBoundaryViolation(`${key} ${value}`)) {
    violations.push(`vocabulary ${key}: trips ${v.patternId} ("${v.matched}")`);
  }
}

// Scan identifier-looking string literals in UI label tables. We look for
// snake_case / kebab-case tokens (identifiers), not prose, to avoid flagging
// quoted document text.
const IDENTIFIER_RE = /['"`]([a-z][a-z0-9_]*(?:[_-][a-z0-9_]+)+)['"`]/g;

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (!rel.includes('/ui/') && !rel.includes('/vocab/') && !rel.includes('/labels')) continue;
    const text = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = IDENTIFIER_RE.exec(text)) !== null) {
      const token = m[1]!;
      for (const v of scanForBoundaryViolation(token)) {
        violations.push(`${rel}: identifier "${token}" trips ${v.patternId}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('clinical_boundary_violation:\n' + violations.join('\n'));
  console.error(
    '\nIf this is intentional, add a decision record (docs/decisions/) and update the guard.',
  );
  process.exit(1);
}

console.log('clinical boundary scan: clean');
