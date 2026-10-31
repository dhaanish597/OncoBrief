import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSignature } from '../src/file-validation';
import { createDemo, reduce, hydrate } from '../src/domain';
test('magic bytes reject renamed executables and truncated images', () => {
  assert.equal(matchesSignature(new Uint8Array([0x4d,0x5a,0,0]),'application/pdf'),false);
  assert.equal(matchesSignature(new Uint8Array([0x25,0x50,0x44,0x46,0x2d]),'application/pdf'),true);
  assert.equal(matchesSignature(new Uint8Array([0x89,0x50,0x4e]),'image/png'),false);
});
test('leave preserves drafts and all patient-authored preparation', () => {
  let s=createDemo();s=reduce(s,{ type:'onboard' });s=reduce(s,{ type:'question',text:'My saved question' });
  const left=reduce(s,{ type:'leave' });assert.equal(left.onboarded,false);assert.deepEqual(left.questions,s.questions);
});
test('malformed nested persisted records are rejected', () => {
  const s=createDemo();assert.throws(() => hydrate(JSON.stringify({ ...s,grants:[{ simulated:true,ids:['d1'],recipient:null }] })));
  assert.throws(() => hydrate(JSON.stringify({ ...s,ledger:[{ ...s.ledger[0],source:{ ...s.ledger[0]!.source,quote:'invented unsupported text' } }] })));
});
