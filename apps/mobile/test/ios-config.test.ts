import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('MOB-024: Native iOS Configuration & Build Verification Specs', () => {
  const mobileDir = path.resolve(__dirname, '..');
  const appJsonPath = path.join(mobileDir, 'app.json');
  const packageJsonPath = path.join(mobileDir, 'package.json');
  const xcodeProjPath = path.join(mobileDir, 'ios/OncoBrief.xcodeproj');
  const infoPlistPath = path.join(mobileDir, 'ios/OncoBrief/Info.plist');
  const appDelegatePath = path.join(mobileDir, 'ios/OncoBrief/AppDelegate.swift');

  test('enforces ios.bundleIdentifier === "org.oncobrief.patient" in app.json', () => {
    assert.equal(fs.existsSync(appJsonPath), true);
    const content = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    assert.ok(content.expo);
    assert.ok(content.expo.ios);
    assert.equal(content.expo.ios.bundleIdentifier, 'org.oncobrief.patient');
    assert.equal(content.expo.ios.supportsTablet, true);
  });

  test('configures ITSAppUsesNonExemptEncryption === false for App Store compliance', () => {
    const content = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    assert.ok(content.expo.ios.infoPlist);
    assert.equal(content.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
  });

  test('configures export:ios script in package.json', () => {
    assert.equal(fs.existsSync(packageJsonPath), true);
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.ok(pkg.scripts);
    assert.ok(pkg.scripts['export:ios'], 'export:ios script must exist');
    assert.match(pkg.scripts['export:ios'], /expo export --platform ios/);
  });

  test('verifies native Xcode project and iOS AppDelegate exist', {
    skip: !fs.existsSync(path.join(mobileDir, 'ios'))
      ? 'Generated iOS project absent; run expo prebuild --platform ios --no-install for this check.' : false,
  }, () => {
    assert.equal(fs.existsSync(xcodeProjPath), true, 'OncoBrief.xcodeproj must exist');
    assert.equal(fs.existsSync(infoPlistPath), true, 'Info.plist must exist');
    assert.equal(fs.existsSync(appDelegatePath), true, 'AppDelegate.swift must exist');
  });

  test('verifies exported iOS Hermes bytecode bundle exists and is valid size', {
    skip: !fs.existsSync(path.join(mobileDir, 'dist-ios')) && process.env.VERIFY_MOBILE_EXPORTS !== '1'
      ? 'Generated iOS export absent; verify:patient-mobile exports and then requires this artifact check.' : false,
  }, () => {
    const iosJsDir = path.join(mobileDir, 'dist-ios/_expo/static/js/ios');
    assert.equal(fs.existsSync(iosJsDir), true, 'iOS static JS directory must exist');
    const files = fs.readdirSync(iosJsDir).filter((f) => f.endsWith('.hbc'));
    assert.ok(files.length > 0, 'At least one .hbc iOS bundle must be present');
    const hbcFile = files[0];
    assert.ok(hbcFile, 'At least one .hbc iOS bundle must be present');
    const hbcPath = path.join(iosJsDir, hbcFile);
    const stat = fs.statSync(hbcPath);
    assert.ok(stat.size > 1_000_000, 'iOS HBC bundle must be > 1MB');
  });
});
