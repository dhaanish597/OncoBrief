import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, reduce, hydrate } from '../src/domain';
import { labObservations, filterLabs, comparison, referencePosition, filterJourney, wellbeingHistory,historyStart,validDateRange } from '../src/patient-selectors';
test('lab results project only finite, source-anchored ledger observations', () => {
  const s=createDemo();const values=labObservations(s);
  assert.equal(values.length,2);assert.equal(values[0]?.value,12.4);
  assert.ok(values.every(o => s.documents.find(d => d.id===o.documentId)?.originalText?.includes(o.quote)));
  assert.equal(labObservations({ ...s,ledger:[] }).length,0);
});
test('lab category, test search and date filters compose without manufacturing history', () => {
  const data=labObservations(createDemo());
  assert.equal(filterLabs(data,{ query:'haemo',category:'blood',from:'2026-10-20' }).length,1);
  assert.equal(filterLabs(data,{ query:'potassium' }).length,0);
  assert.equal(filterLabs(data,{ from:'2026-11-01' }).length,0);
});
test('numeric comparison requires matching tests, laboratory and units', () => {
  const [latest,earlier]=labObservations(createDemo());
  assert.equal(comparison(latest!,earlier!).kind,'higher');assert.equal(comparison(latest!,earlier!).delta,0.3);
  assert.equal(comparison(latest!,{ ...earlier!,unit:'g/L' }).kind,'incompatible');
  assert.equal(comparison(latest!,{ ...earlier!,facility:'Another lab' }).kind,'incompatible');
  assert.equal(comparison(latest!).kind,'no-earlier');
});
test('reference indicators reject missing, reversed, nonfinite and mismatched units', () => {
  const [value]=labObservations(createDemo());assert.ok(referencePosition(value!));
  assert.equal(referencePosition({ ...value!,reference:undefined }),null);
  assert.equal(referencePosition({ ...value!,reference:{ low:16,high:12,unit:'g/dL' } }),null);
  assert.equal(referencePosition({ ...value!,reference:{ low:12,high:15.5,unit:'g/L' } }),null);
  assert.equal(referencePosition({ ...value!,value:Infinity }),null);
});
test('patients can edit and explicitly remove their own questions without altering evidence', () => {
  const s=createDemo();const edited=reduce(s,{ type:'editQuestion',id:'q1',text:'Please confirm the appointment date.' });
  assert.equal(edited.questions[0]?.text,'Please confirm the appointment date.');assert.deepEqual(edited.ledger,s.ledger);
  assert.throws(() => reduce(edited,{ type:'removeQuestion',id:'q1',approved:false }));
  const removed=reduce(edited,{ type:'removeQuestion',id:'q1',approved:true });assert.equal(removed.questions.length,0);assert.equal(removed.audit.at(-1)?.action,'removeQuestion');
  assert.equal(hydrate(JSON.stringify(removed)).questions.length,0);
});
test('journey source category, search and ordering remain ledger projections', () => {
  const s=createDemo();const result=filterJourney(s,{ category:'pathology',query:'report',sort:'oldest' });
  assert.equal(result.length,1);assert.equal(result[0]?.source.documentId,'d3');
  assert.equal(filterJourney(s,{ category:'imaging' }).length,0);
});
test('wellbeing filtering preserves individual entries instead of inventing a daily medical score', () => {
  let s=createDemo();s=reduce(s,{ type:'wellbeing',text:'Tired',intensity:2 },'2026-10-01T10:00:00Z');
  s=reduce(s,{ type:'wellbeing',text:'Rested',intensity:4 },'2026-10-25T10:00:00Z');
  assert.equal(wellbeingHistory(s,'2026-10-20').length,1);assert.equal(wellbeingHistory(s)[0]?.source,'patient-reported');
});
test('calendar-month windows clamp month ends and date filters reject impossible or reversed dates',() => {
  const value=labObservations(createDemo())[0]!;
  assert.equal(historyStart([{ ...value,date:'2026-03-31' }],'1M'),'2026-02-28');
  assert.equal(validDateRange('2026-02-30',''),false);assert.equal(validDateRange('2026-10-24','2026-10-14'),false);assert.equal(validDateRange('2026-10-01','2026-10-24'),true);
});
test('wellbeing date filters use the same patient calendar day as displayed timestamps',() => {
  const s=reduce(createDemo(),{ type:'wellbeing',text:'After midnight',intensity:2 },'2026-10-28T19:00:00Z');
  assert.equal(wellbeingHistory(s,'2026-10-29','2026-10-29','Asia/Kolkata').length,1);
  assert.equal(wellbeingHistory(s,'2026-10-28','2026-10-28','Asia/Kolkata').length,0);
});
