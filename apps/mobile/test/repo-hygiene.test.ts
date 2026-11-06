import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const decisionsDir = path.resolve(__dirname, '../../../docs/decisions');

test('ADR numeric identifiers are unique in docs/decisions', () => {
  const files = fs.readdirSync(decisionsDir);
  const adrFiles = files.filter(f => /^\d{4}-.+\.md$/.test(f));
  const prefixMap = new Map<string, string[]>();

  for (const file of adrFiles) {
    const prefix = file.slice(0, 4);
    const existing = prefixMap.get(prefix) || [];
    existing.push(file);
    prefixMap.set(prefix, existing);
  }

  const duplicates = Array.from(prefixMap.entries()).filter(([_, list]) => list.length > 1);
  if (duplicates.length > 0) {
    const [prefix, list] = duplicates[0]!;
    assert.fail(`Duplicate ADR numeric prefix '${prefix}' found in docs/decisions (${list.join(', ')})`);
  }
});

test('original ABDM ADR 0017 remains intact', () => {
  const abdmPath = path.join(decisionsDir, '0017-abdm-m2-m3-integration.md');
  assert.ok(fs.existsSync(abdmPath), '0017-abdm-m2-m3-integration.md must exist');
  const content = fs.readFileSync(abdmPath, 'utf8');
  assert.ok(content.includes('ABDM V3 Integration'), 'ABDM ADR must contain ABDM V3 Integration');
  assert.ok(content.includes('Milestone 2 (HIP'), 'ABDM ADR must contain Milestone 2 (HIP)');
  assert.ok(content.includes('Milestone 3 (HIU'), 'ABDM ADR must contain Milestone 3 (HIU)');
});

test('patient mobile architecture ADR has unique non-colliding identifier (0026)', () => {
  const oldPath = path.join(decisionsDir, '0017-independent-patient-android.md');
  assert.ok(!fs.existsSync(oldPath), '0017-independent-patient-android.md must be renumbered to resolve BUG-MOB-14');

  const newPath = path.join(decisionsDir, '0026-patient-mobile-architecture.md');
  assert.ok(fs.existsSync(newPath), '0026-patient-mobile-architecture.md must exist as unique sequential ADR');
});

test('mobile architecture ADR documents dual-mode architecture and clinical boundaries', () => {
  const newPath = path.join(decisionsDir, '0026-patient-mobile-architecture.md');
  if (!fs.existsSync(newPath)) {
    assert.fail('0026-patient-mobile-architecture.md does not exist yet');
  }
  const content = fs.readFileSync(newPath, 'utf8');

  // Must document dual-mode architecture
  assert.ok(
    content.includes('Connected Hospital Mode'),
    'ADR must document Connected Hospital Mode'
  );
  assert.ok(
    content.includes('Offline Synthetic Demo Mode'),
    'ADR must document Offline Synthetic Demo Mode'
  );

  // Must document clinical boundaries & Evidence Ledger
  assert.ok(
    content.includes('Evidence Ledger'),
    'ADR must reference Evidence Ledger as the source of truth'
  );
  assert.ok(
    content.includes('non-diagnostic'),
    'ADR must specify strict non-diagnostic clinical boundaries'
  );
  assert.ok(
    content.includes('clinician verification') || content.includes('human approval'),
    'ADR must preserve patient review vs clinician verification separation'
  );
});

test('apps/mobile package.json contains required scripts and dependencies', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  assert.ok(fs.existsSync(pkgPath), 'apps/mobile/package.json must exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.name, '@oncobrief/mobile');
  assert.ok(pkg.scripts?.test, 'package.json must define test script');
  assert.ok(pkg.scripts?.typecheck, 'package.json must define typecheck script');
  assert.ok(pkg.dependencies?.expo, 'expo dependency must be defined');
  assert.ok(pkg.dependencies?.['react-native'], 'react-native dependency must be defined');
});
