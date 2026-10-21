/**
 * Clinical-boundary scan (architecture §18.1).
 *
 * CI-failing check that recursively inspects all .ts and .tsx source files
 * across apps/web/src, apps/worker/src, packages/domain/src, packages/adapters/src,
 * and packages/db/src (excluding *.test.ts, *.spec.ts, and clinical-boundary.ts itself)
 * for forbidden clinical concepts.
 *
 *   node --import tsx tools/check-clinical-boundary.ts
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
const TARGET_DIRS = [
  'apps/web/src',
  'apps/worker/src',
  'packages/domain/src',
  'packages/adapters/src',
  'packages/db/src',
];
const SOURCE_EXT = /\.(ts|tsx)$/;
const IGNORE_PATTERNS = [
  'node_modules',
  '.next',
  'dist',
  '__tests__',
];

const registryStrings: [string, string][] = [
  ...Object.entries(FACT_TYPE_LABEL),
  ...Object.entries(TASK_KIND_LABEL),
  ...Object.entries(DOCUMENT_TYPE_LABEL),
  ...Object.entries(EVIDENCE_STATE_LABEL),
  ...Object.entries(PACKET_SECTION_LABEL),
  ...Object.entries(READINESS_BAND_LABEL),
];

function shouldSkip(filePath: string): boolean {
  const norm = filePath.replaceAll('\\', '/');
  if (norm.endsWith('.test.ts') || norm.endsWith('.test.tsx') || norm.endsWith('.spec.ts') || norm.endsWith('.spec.tsx')) {
    return true;
  }
  if (norm.endsWith('clinical-boundary.ts')) {
    return true;
  }
  for (const ign of IGNORE_PATTERNS) {
    if (norm.includes(`/${ign}/`) || norm.includes(`/${ign}`)) {
      return true;
    }
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (shouldSkip(full)) continue;
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

// Regex to find identifier and string literal candidates
const IDENTIFIER_RE = /['"`]([a-z][a-z0-9_]*(?:[_-][a-z0-9_]+)+)['"`]/g;
const CODE_TOKEN_RE = /\b(calculateTnm|computeTnm|inferStaging|calculateRecist|recistResponse|trialEligibilityScore|prescribeTreatment|interpretImaging|diagnoseDicom)\b/i;

for (const dir of TARGET_DIRS) {
  const fullDir = join(root, dir);
  for (const file of walk(fullDir)) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8');

    // 1. Check code tokens / function names
    const codeMatch = CODE_TOKEN_RE.exec(text);
    if (codeMatch) {
      violations.push(`${rel}: forbidden clinical inference pattern "${codeMatch[0]}"`);
    }

    // 2. Check identifier string literals
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
