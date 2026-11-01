import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluatePrivacyShieldState,
  type PrivacyShieldState,
} from '../src/privacy-core';

const ROOT = path.resolve(__dirname, '..');

describe('MOB-019: Privacy Hardening, App-Switcher Privacy Veil & Zero External URL Leakage (SEC-MOB-05, SEC-MOB-06, REQ-MOB-036)', () => {
  it('asserts zero external medlineplus.gov or unconsented URLs in laboratory.tsx (SEC-MOB-06)', () => {
    const labPath = path.join(ROOT, 'src/laboratory.tsx');
    const content = fs.readFileSync(labPath, 'utf8');

    assert.ok(
      !content.includes('medlineplus.gov'),
      "External URL leakage 'medlineplus.gov' found in apps/mobile/src/laboratory.tsx"
    );
    assert.ok(
      !content.includes('Linking.openURL'),
      "Unconsented external URL launch 'Linking.openURL' found in apps/mobile/src/laboratory.tsx"
    );
  });

  it('scans all mobile source files to ensure zero third-party medical search query leaks', () => {
    const srcDir = path.join(ROOT, 'src');
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf8');
      assert.ok(
        !content.includes('google.com/search'),
        `Prohibited search query leakage in ${file}`
      );
      assert.ok(
        !content.includes('medlineplus'),
        `Prohibited medlineplus reference in ${file}`
      );
      assert.ok(
        !content.includes('webmd.com'),
        `Prohibited commercial health leakage in ${file}`
      );
    }
  });

  it('transitions privacy veil based on OS AppState lifecycle events (SEC-MOB-05)', () => {
    // Active app state -> no veil
    let state: PrivacyShieldState = evaluatePrivacyShieldState('active');
    assert.equal(state.isVeiled, false, 'Active app state must not obscure content');

    // Inactive app state (task switcher opened on iOS/Android) -> veiled
    state = evaluatePrivacyShieldState('inactive');
    assert.equal(state.isVeiled, true, 'Inactive app state must veil screen to protect recents snapshot');

    // Background app state (app sent to background) -> veiled
    state = evaluatePrivacyShieldState('background');
    assert.equal(state.isVeiled, true, 'Background app state must veil screen to prevent task snapshot leakage');

    // Returning to active -> veil lifted
    state = evaluatePrivacyShieldState('active');
    assert.equal(state.isVeiled, false, 'Returning to active app state must lift privacy veil');
  });

  it('verifies Android configuration enforces allowBackup: false and screen capture protection (REQ-MOB-036)', () => {
    const appJsonPath = path.join(ROOT, 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    assert.equal(
      appJson.expo.android.allowBackup,
      false,
      'app.json must explicitly enforce android.allowBackup = false'
    );

    const pkgJsonPath = path.join(ROOT, 'package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    assert.ok(
      pkgJson.dependencies['expo-screen-capture'],
      'package.json must contain expo-screen-capture for FLAG_SECURE hardware protection'
    );
  });
});
