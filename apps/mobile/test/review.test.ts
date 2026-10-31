import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo,hydrate,reduce } from '../src/domain';
import { DemoRepository } from '../src/repository';
test('additional fixture documents cannot forge clinician confirmation or lab facts',() => {
  const s=createDemo();const forged={ ...s.documents[0],id:'forged',originalText:'Haemoglobin: 99 g/dL',clinicianVerified:true };
  assert.throws(() => hydrate(JSON.stringify({ ...s,documents:[...s.documents,forged] })));
  assert.throws(() => hydrate(JSON.stringify({ ...s,documents:[...s.documents,s.documents[0]] })));
});
test('all rendered persisted metadata has validated shape',() => {
  const s=createDemo();
  for (const invalid of [
    { ...s,documents:s.documents.map((d,i) => i ? d : { ...d,facility:{ bad:true } }) },
    { ...s,missing:s.missing.map(m => ({ ...m,note:{ bad:true } })) },
    { ...s,questions:s.questions.map(q => ({ ...q,answered:{ bad:true } })) },
    { ...s,audit:[{ id:'bad',actor:'demo-patient',action:'read',at:{ bad:true },entityId:3 }] },
  ]) assert.throws(() => hydrate(JSON.stringify(invalid)));
});
test('read failure blocks every mutation and write until explicit successful recovery',async () => {
  let fails=true;let writes=0;const saved=reduce(createDemo(),{ type:'notes',text:'A preserved note' });
  const repository=new DemoRepository({ load:async () => { if (fails) throw new Error('disk');return saved; },save:async () => { writes++; },erase:async () => {} });
  await repository.load();assert.equal(repository.error,'read');assert.throws(() => repository.apply({ type:'locale',locale:'ta' }));await repository.flush();assert.equal(writes,0);
  fails=false;await repository.retry();assert.equal(repository.state.notes,'A preserved note');assert.equal(writes,0);
});
test('write failures remain retryable and serial writes retain the latest state',async () => {
  let fails=true;let disk=createDemo();const repository=new DemoRepository({ load:async () => disk,save:async s => { if (fails) throw new Error('disk');disk=s; },erase:async () => {} });
  await repository.load();repository.apply({ type:'question',text:'Keep my draft?' });await repository.flush();assert.equal(repository.error,'write');fails=false;await repository.retry();assert.equal(disk.questions.at(-1)?.text,'Keep my draft?');assert.equal(repository.error,null);
});
test('form drafts survive saved-state hydration independently of submitted notes',() => {
  const s=reduce(createDemo(),{ type:'draft',key:'notes',text:'An unfinished note' });
  const restored=hydrate(JSON.stringify(s));assert.equal(restored.drafts.notes,'An unfinished note');assert.equal(restored.notes,'');
});
