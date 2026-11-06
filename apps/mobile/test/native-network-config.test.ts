import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileModsAsync } from 'expo/config-plugins';

const require = createRequire(import.meta.url);

test('native config plugin durably attaches a deny-by-default loopback-only Android network policy', async () => {
  const pluginPath = path.resolve(__dirname, '../plugins/with-network-security.cjs');
  const app = JSON.parse(await readFile(path.resolve(__dirname, '../app.json'), 'utf8'));
  assert.ok(app.expo.plugins.includes('./plugins/with-network-security.cjs'));
  const withNetworkSecurity = require(pluginPath) as import('expo/config-plugins').ConfigPlugin;
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'oncobrief-native-policy-'));
  try {
    const mainDir = path.join(projectRoot, 'android/app/src/main');
    await mkdir(mainDir, { recursive: true });
    await writeFile(path.join(mainDir, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:allowBackup="false" /></manifest>');
    let config = withNetworkSecurity({ name: 'OncoBrief', slug: 'oncobrief', android: { package: 'org.oncobrief.patient' } });
    config = await compileModsAsync(config, { projectRoot, platforms: ['android'] });
    assert.ok(config);
    const manifest = await readFile(path.join(mainDir, 'AndroidManifest.xml'), 'utf8');
    assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/);
    const xml = await readFile(path.join(mainDir, 'res/xml/network_security_config.xml'), 'utf8');
    assert.match(xml, /<base-config cleartextTrafficPermitted="false"\s*\/>/);
    assert.deepEqual([...xml.matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map((m) => m[1]), ['localhost', '127.0.0.1', '::1']);
    assert.equal((xml.match(/<domain-config/g) ?? []).length, 1);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
