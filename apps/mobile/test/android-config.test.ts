import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('MOB-022: Native Android Configuration & Build Verification Specs', () => {
  const mobileDir = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(mobileDir, '../..');
  const appJsonPath = path.join(mobileDir, 'app.json');
  const manifestPath = path.join(mobileDir, 'android/app/src/main/AndroidManifest.xml');
  const buildScriptPath = path.join(repoRoot, 'tools/verify-android-build.sh');

  test('enforces android.allowBackup === false in app.json for patient privacy', () => {
    assert.equal(fs.existsSync(appJsonPath), true);
    const content = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    assert.ok(content.expo);
    assert.ok(content.expo.android);
    assert.equal(content.expo.android.allowBackup, false);
  });

  test('configures blocked dangerous permissions in app.json', () => {
    const content = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const blocked = content.expo.android.blockedPermissions ?? [];
    assert.ok(blocked.includes('android.permission.RECORD_AUDIO'));
    assert.ok(blocked.includes('android.permission.READ_CONTACTS'));
    assert.ok(blocked.includes('android.permission.READ_EXTERNAL_STORAGE'));
    assert.ok(blocked.includes('android.permission.WRITE_EXTERNAL_STORAGE'));
  });

  test('enforces android:allowBackup="false" in generated AndroidManifest.xml', {
    skip: !fs.existsSync(manifestPath) && 'Native project is not generated; run expo prebuild --platform android to verify the manifest',
  }, () => {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    assert.match(manifest, /android:allowBackup="false"/);
  });

  test('verifies tools/verify-android-build.sh exists and is executable', () => {
    assert.equal(fs.existsSync(buildScriptPath), true, 'tools/verify-android-build.sh must exist');
    const stat = fs.statSync(buildScriptPath);
    assert.ok((stat.mode & 0o111) > 0, 'tools/verify-android-build.sh must be executable');
  });

  test('verifies tools/verify-android-runtime.sh exists and is executable (MOB-023)', () => {
    const runtimeScriptPath = path.join(repoRoot, 'tools/verify-android-runtime.sh');
    assert.equal(fs.existsSync(runtimeScriptPath), true, 'tools/verify-android-runtime.sh must exist');
    const stat = fs.statSync(runtimeScriptPath);
    assert.ok((stat.mode & 0o111) > 0, 'tools/verify-android-runtime.sh must be executable');
  });

  test('verifies Maestro smoke and connected test flows exist for org.oncobrief.patient (MOB-023)', () => {
    const smokeYamlPath = path.join(mobileDir, 'maestro/patient-smoke.yaml');
    const connectedYamlPath = path.join(mobileDir, 'maestro/patient-connected.yaml');
    assert.equal(fs.existsSync(smokeYamlPath), true, 'patient-smoke.yaml must exist');
    assert.equal(fs.existsSync(connectedYamlPath), true, 'patient-connected.yaml must exist');

    const smokeContent = fs.readFileSync(smokeYamlPath, 'utf8');
    const connectedContent = fs.readFileSync(connectedYamlPath, 'utf8');
    assert.match(smokeContent, /appId:\s*org\.oncobrief\.patient/);
    assert.match(connectedContent, /appId:\s*org\.oncobrief\.patient/);
  });
});
