import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

test('tools/check-clinical-boundary.ts includes apps/mobile/src and apps/mobile/app in TARGET_DIRS (BUG-MOB-03)', () => {
  const toolScannerPath = path.join(rootDir, 'tools/check-clinical-boundary.ts');
  assert.ok(fs.existsSync(toolScannerPath), 'tools/check-clinical-boundary.ts must exist');
  const toolContent = fs.readFileSync(toolScannerPath, 'utf8');

  assert.ok(
    toolContent.includes("'apps/mobile/src'") || toolContent.includes('"apps/mobile/src"'),
    'TARGET_DIRS in tools/check-clinical-boundary.ts must include apps/mobile/src'
  );
  assert.ok(
    toolContent.includes("'apps/mobile/app'") || toolContent.includes('"apps/mobile/app"'),
    'TARGET_DIRS in tools/check-clinical-boundary.ts must include apps/mobile/app'
  );
});

test('apps/mobile contains zero prohibited clinical code tokens', () => {
  const CODE_TOKEN_RE = /\b(calculateTnm|computeTnm|inferStaging|calculateRecist|recistResponse|trialEligibilityScore|prescribeTreatment|interpretImaging|diagnoseDicom)\b/i;
  const mobileDir = path.resolve(__dirname, '..');
  const dirsToScan = [path.join(mobileDir, 'src'), path.join(mobileDir, 'app')];

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
        const text = fs.readFileSync(fullPath, 'utf8');
        const match = CODE_TOKEN_RE.exec(text);
        if (match) {
          assert.fail(`Prohibited clinical token '${match[0]}' found in ${path.relative(mobileDir, fullPath)}`);
        }
      }
    }
  }

  for (const dir of dirsToScan) {
    if (fs.existsSync(dir)) scan(dir);
  }
});
