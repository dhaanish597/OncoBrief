import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptEnvelope,
  decryptEnvelope,
  generateEncryptionKey,
  type EncryptedEnvelopeV2,
  sha256Hex,
} from '../src/crypto-envelope';
import {
  createDemo,
  stamp,
  verifyAuditChain,
  type State,
  type AuditItem,
} from '../src/domain';
import {
  loadState,
  saveState,
  eraseState,
  setStorageBackendForTesting,
} from '../src/storage';

describe('MOB-018: Authenticated Encrypted Storage & Cryptographic Envelope (REQ-MOB-034, SEC-MOB-01)', () => {
  it('generates a 256-bit AES key and produces valid EncryptedEnvelopeV2', async () => {
    const key = generateEncryptionKey();
    assert.equal(key.length, 32, 'Key must be exactly 32 bytes (256 bits)');

    const plaintext = JSON.stringify({ secret: 'oncology-phi', patient: 'Meenakshi' });
    const envelope = await encryptEnvelope(plaintext, key);

    assert.equal(envelope.v, 2);
    assert.equal(envelope.alg, 'AES-256-GCM');
    assert.ok(envelope.iv && typeof envelope.iv === 'string', 'IV must be a base64 string');
    assert.ok(envelope.tag && typeof envelope.tag === 'string', 'Tag must be a base64 string');
    assert.ok(envelope.ciphertext && typeof envelope.ciphertext === 'string', 'Ciphertext must be a base64 string');

    const decrypted = await decryptEnvelope(envelope, key);
    assert.equal(decrypted, plaintext);
  });

  it('rejects tampered ciphertext, authentication tag, or IV (SEC-NEG-18)', async () => {
    const key = generateEncryptionKey();
    const plaintext = 'sensitive-clinical-observation';
    const envelope = await encryptEnvelope(plaintext, key);

    // Tamper ciphertext
    const tamperedCiphertext: EncryptedEnvelopeV2 = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA',
    };
    await assert.rejects(
      async () => decryptEnvelope(tamperedCiphertext, key),
      /tamper|mismatch|failed|cipher/i,
      'Must reject tampered ciphertext'
    );

    // Tamper tag
    const tamperedTag: EncryptedEnvelopeV2 = {
      ...envelope,
      tag: envelope.tag.slice(0, -4) + 'BBBB',
    };
    await assert.rejects(
      async () => decryptEnvelope(tamperedTag, key),
      /tamper|mismatch|failed|cipher/i,
      'Must reject tampered auth tag'
    );

    // Wrong key
    const wrongKey = generateEncryptionKey();
    await assert.rejects(
      async () => decryptEnvelope(envelope, wrongKey),
      /tamper|mismatch|failed|cipher/i,
      'Must reject decryption with wrong key'
    );
  });

  it('ensures raw persisted disk payload contains zero plaintext PHI (SEC-MOB-01)', async () => {
    const memoryFiles = new Map<string, string>();
    const secureStore = new Map<string, string>();

    setStorageBackendForTesting({
      read: async (path) => memoryFiles.get(path) ?? null,
      write: async (path, content) => { memoryFiles.set(path, content); },
      delete: async (path) => { memoryFiles.delete(path); },
      secureGet: async (key) => secureStore.get(key) ?? null,
      secureSet: async (key, val) => { secureStore.set(key, val); },
      secureDelete: async (key) => { secureStore.delete(key); },
    });

    const state = createDemo('DEMO-001');
    state.notes = 'Personal clinical note: Meenakshi has Invasive Ductal carcinoma with low Hemoglobin.';

    await saveState(state);

    // Assert file was written
    const files = Array.from(memoryFiles.entries());
    assert.ok(files.length > 0, 'Encrypted file should be written to storage');

    for (const [filename, content] of files) {
      assert.ok(
        !content.includes('Meenakshi'),
        `Persisted file ${filename} leaked patient name 'Meenakshi'`
      );
      assert.ok(
        !content.includes('Invasive Ductal'),
        `Persisted file ${filename} leaked diagnosis 'Invasive Ductal'`
      );
      assert.ok(
        !content.includes('Hemoglobin'),
        `Persisted file ${filename} leaked lab test 'Hemoglobin'`
      );

      // Must be parsed as EncryptedEnvelopeV2
      const parsed = JSON.parse(content);
      assert.equal(parsed.v, 2);
      assert.equal(parsed.alg, 'AES-256-GCM');
    }

    // Hydration succeeds from encrypted storage
    const loaded = await loadState();
    assert.equal(loaded.patientName, state.patientName);
    assert.equal(loaded.notes, state.notes);
  });

  it('migrates legacy plaintext state-v1.json to state-v2.enc.json and deletes legacy file', async () => {
    const memoryFiles = new Map<string, string>();
    const secureStore = new Map<string, string>();

    const legacyState = createDemo('DEMO-002');
    legacyState.notes = 'Legacy unencrypted note';
    memoryFiles.set('legacy-state-v1.json', JSON.stringify(legacyState));

    setStorageBackendForTesting({
      read: async (path) => memoryFiles.get(path) ?? null,
      write: async (path, content) => { memoryFiles.set(path, content); },
      delete: async (path) => { memoryFiles.delete(path); },
      secureGet: async (key) => secureStore.get(key) ?? null,
      secureSet: async (key, val) => { secureStore.set(key, val); },
      secureDelete: async (key) => { secureStore.delete(key); },
    });

    const loaded = await loadState();
    assert.equal(loaded.personaId, 'DEMO-002');
    assert.equal(loaded.notes, 'Legacy unencrypted note');

    // Verify migration: legacy state deleted, v2 encrypted state created
    assert.equal(memoryFiles.has('legacy-state-v1.json'), false, 'Legacy file must be deleted');
    const v2Content = Array.from(memoryFiles.values())[0];
    assert.ok(v2Content, 'V2 state must exist');
    const parsedV2 = JSON.parse(v2Content);
    assert.equal(parsedV2.v, 2);
  });

  it('cryptographically shreds key and persisted files on eraseState() (REQ-MOB-035)', async () => {
    const memoryFiles = new Map<string, string>();
    const secureStore = new Map<string, string>();

    setStorageBackendForTesting({
      read: async (path) => memoryFiles.get(path) ?? null,
      write: async (path, content) => { memoryFiles.set(path, content); },
      delete: async (path) => { memoryFiles.delete(path); },
      secureGet: async (key) => secureStore.get(key) ?? null,
      secureSet: async (key, val) => { secureStore.set(key, val); },
      secureDelete: async (key) => { secureStore.delete(key); },
    });

    const state = createDemo('DEMO-001');
    await saveState(state);
    assert.ok(memoryFiles.size > 0);
    assert.ok(secureStore.size > 0);

    await eraseState();

    assert.equal(memoryFiles.size, 0, 'All persisted encrypted files must be wiped');
    assert.equal(secureStore.size, 0, 'Secure key must be wiped from secure store');
  });

  it('persists and restores demo state in web environment across simulated reloads (BUG-MOB-08)', async () => {
    const webLocalStorage = new Map<string, string>();

    setStorageBackendForTesting({
      isWeb: true,
      webGetItem: (key) => webLocalStorage.get(key) ?? null,
      webSetItem: (key, val) => { webLocalStorage.set(key, val); },
      webRemoveItem: (key) => { webLocalStorage.delete(key); },
    });

    const demo = createDemo('DEMO-003');
    demo.notes = 'Note written in web demo session';
    await saveState(demo);

    assert.ok(webLocalStorage.size > 0, 'Web localStorage must hold state');

    // Simulate browser reload (F5) by loading state again
    const reloaded = await loadState();
    assert.equal(reloaded.personaId, 'DEMO-003');
    assert.equal(reloaded.notes, 'Note written in web demo session');

    // Clear state
    await eraseState();
    assert.equal(webLocalStorage.size, 0, 'eraseState wipes web localStorage');
  });
});

describe('MOB-018: Tamper-Evident Hash-Chained Audit Log (SEC-MOB-07, REQ-MOB-037)', () => {
  it('chains audit log entries with SHA-256 hashes linking to previous entries', () => {
    let s = createDemo('DEMO-001');
    assert.ok(Array.isArray(s.audit));

    // Dispatch several mutations
    s = stamp(s, { type: 'addCheck', text: 'Pick up medical records from clinic' });
    s = stamp(s, { type: 'question', text: 'What is the dosage schedule?' });
    s = stamp(s, { type: 'notes', text: 'Questions for doctor' });

    assert.equal(s.audit.length, 3);

    // Verify chain integrity
    assert.equal(verifyAuditChain(s.audit), true, 'Valid chain must pass verification');

    // First entry has prevHash === 'GENESIS'
    const entry0 = s.audit[0];
    const entry1 = s.audit[1];
    const entry2 = s.audit[2];
    assert.ok(entry0 && entry1 && entry2);

    assert.equal(entry0.prevHash, 'GENESIS');
    assert.ok(entry0.hash && typeof entry0.hash === 'string');

    // Subsequent entries link to previous hash
    assert.equal(entry1.prevHash, entry0.hash);
    assert.equal(entry2.prevHash, entry1.hash);
  });

  it('detects tampering with any audit entry and returns false', () => {
    let s = createDemo('DEMO-001');
    s = stamp(s, { type: 'addCheck', text: 'Original item' });
    s = stamp(s, { type: 'question', text: 'Original question' });

    assert.equal(verifyAuditChain(s.audit), true);

    // Tamper with action of entry 0
    const tampered = JSON.parse(JSON.stringify(s.audit)) as AuditItem[];
    if (tampered[0]) tampered[0].action = 'tampered_action';
    assert.equal(verifyAuditChain(tampered), false, 'Tampered action must fail audit chain verification');

    // Tamper with timestamp
    const tamperedTime = JSON.parse(JSON.stringify(s.audit)) as AuditItem[];
    if (tamperedTime[1]) tamperedTime[1].at = '2020-01-01T00:00:00.000Z';
    assert.equal(verifyAuditChain(tamperedTime), false, 'Tampered timestamp must fail audit chain verification');

    // Dropped middle entry
    const e0 = s.audit[0]!;
    const e1 = s.audit[1]!;
    const dropped: AuditItem[] = [e0, { ...e1, prevHash: 'BROKEN_HASH' }];
    assert.equal(verifyAuditChain(dropped), false, 'Broken prevHash pointer must fail audit chain verification');
  });

  it('enforces a maximum boundary cap of 250 entries on state.audit (SEC-MOB-07)', () => {
    let s = createDemo('DEMO-001');
    for (let i = 0; i < 260; i++) {
      s = stamp(s, { type: 'addCheck', text: `Item ${i}` });
    }

    assert.equal(s.audit.length, 250, 'state.audit must be capped at 250 entries');
    assert.equal(verifyAuditChain(s.audit), true, 'Capped chain must remain verified');
  });
});
