import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patientEn, patientTa } from '../src/patient-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileDir = path.resolve(__dirname, '..');

test('profile screen renders clean Tamil string and no Cyrillic mojibake', () => {
  const profilePath = path.join(mobileDir, 'app/(tabs)/profile.tsx');
  const profileContent = fs.readFileSync(profilePath, 'utf8');

  // Must contain clean Tamil string 'தமிழ்'
  assert.ok(profileContent.includes('title="தமிழ்"'), 'Profile screen must render title="தமிழ்"');

  // Must not contain corrupted CP866 Cyrillic Mojibake
  const cyrillicRegex = /[\u0400-\u04FF]/;
  assert.ok(!cyrillicRegex.test(profileContent), 'Profile screen must not contain any Cyrillic characters');
});

test('zero Cyrillic characters exist across all mobile source files', () => {
  const cyrillicRegex = /[\u0400-\u04FF]/;
  const dirsToScan = [path.join(mobileDir, 'src'), path.join(mobileDir, 'app')];

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const match = cyrillicRegex.exec(content);
        if (match) {
          assert.fail(`Found Cyrillic character '${match[0]}' in ${path.relative(mobileDir, fullPath)}`);
        }
      }
    }
  }

  for (const dir of dirsToScan) {
    if (fs.existsSync(dir)) scan(dir);
  }
});

test('100% key parity between English and Tamil patient copy dictionaries', () => {
  const enKeys = Object.keys(patientEn).sort();
  const taKeys = Object.keys(patientTa).sort();

  assert.deepEqual(enKeys, taKeys, 'patientEn and patientTa must have identical keys');

  for (const key of enKeys) {
    const val = patientTa[key as keyof typeof patientTa];
    assert.ok(val && val.trim().length > 0, `patientTa.${key} must not be empty`);
  }
});

test('audit.tsx contains translations for edit_question and remove_question actions (BUG-MOB-10)', () => {
  const auditPath = path.join(mobileDir, 'app/audit.tsx');
  const auditContent = fs.readFileSync(auditPath, 'utf8');

  // Check that the labels record includes edit_question and remove_question
  assert.ok(
    auditContent.includes('edit_question') && auditContent.includes('remove_question'),
    'app/audit.tsx must include mappings for edit_question and remove_question audit actions'
  );
});

test('Tamil translations contain valid Tamil unicode or standard symbols', () => {
  const tamilUnicodeRegex = /[\u0B80-\u0BFF]/;
  const values = Object.values(patientTa);
  const hasTamil = values.some(v => tamilUnicodeRegex.test(v));
  assert.ok(hasTamil, 'patientTa must contain characters in the Tamil Unicode block (U+0B80–U+0BFF)');
});
