import { translate } from './i18n';
export type Locale = 'en' | 'ta';
export type Category = 'laboratory' | 'pathology' | 'imaging' | 'referral' | 'prescription' | 'other';
export type EvidenceStatus = 'extracted' | 'clinician-confirmed' | 'conflicting';
export interface DocumentRecord {
  id: string; name: string; category: Category; date: string; facility: string;
  mimeType: string; size: number; uri?: string; originalText?: string;
  version: string; extraction: 'fixture' | 'unavailable'; patientReviewed: boolean;
  clinicianVerified: boolean; addedAt: string;
}
export interface Evidence {
  id: string; kind: 'document' | 'appointment' | 'note'; title: string; titleTa: string;
  date: string; status: EvidenceStatus;
  observation?: { test: 'haemoglobin'; value:number; unit:'g/dL'; referenceLow:number; referenceHigh:number };
  source: { documentId: string; page: number; quote: string; version: string; method: 'synthetic-fixture'; confidence: 'not-applicable'; reviewer?: string; reviewedAt?: string };
}
export interface Check { id: string; label: string; labelTa?: string; done: boolean; enabled: boolean; optional: boolean }
export interface Grant { id: string; recipient: string; purpose: string; ids: string[]; expiresAt: string; revokedAt?: string; simulated: true; createdAt: string }
export type DraftKey='question'|'notes'|'check'|'recipient'|'purpose'|'missingText'|'missingNote'|'observation'|'flag';
export interface State {
  version: 1; mode: 'demo'; locale: Locale; onboarded: boolean; reducedMotion: boolean;
  documents: DocumentRecord[]; ledger: Evidence[]; checks: Check[];
  questions: { id: string; text: string; answered: boolean; at: string }[]; notes: string;
  selected: string[]; grants: Grant[];
  drafts:Record<DraftKey,string>;
  observations: { id: string; text: string; intensity: number; source: 'patient-reported'; at: string }[];
  missing: { id: string; text: string; note: string; source: 'patient'; status: 'missing' | 'requested' | 'available' | 'unavailable'; documentId?: string }[];
  flags: { id: string; documentId: string; reason: string; at: string }[];
  audit: { id: string; actor: 'demo-patient'; action: string; entityId: string; at: string }[];
}
const fixtureTime = '2026-10-28T09:00:00.000Z';
export function createDemo(): State {
  const docs: [string, string, Category, string, string, string][] = [
    ['d1', 'Blood count · 14 October', 'laboratory', '2026-10-14', 'Demo laboratory A', 'SYNTHETIC SAMPLE — Blood count report\nReport date: 14 October 2026\nLaboratory: Demo laboratory A\nHaemoglobin: 12.1 g/dL\nReference interval supplied by this synthetic laboratory: 12.0–15.5 g/dL\nThis is fabricated training data, not a patient report.'],
    ['d2', 'Referral letter', 'referral', '2026-10-18', 'Demo clinic', 'SYNTHETIC SAMPLE — Referral letter\nDocument date: 18 October 2026\nAppointment: 30 October 2026 at 10:30\nBring a copy of the referral letter.\nThis is fabricated training data, not a patient report.'],
    ['d3', 'Imaging report cover', 'imaging', '2026-10-20', 'Demo imaging centre', 'SYNTHETIC SAMPLE — Imaging report cover\nReport date: 20 October 2026\nRecord available for review. No clinical findings included.'],
    ['d4', 'Blood count · 24 October', 'laboratory', '2026-10-24', 'Demo laboratory A', 'SYNTHETIC SAMPLE — Blood count report\nReport date: 24 October 2026\nLaboratory: Demo laboratory A\nHaemoglobin: 12.4 g/dL\nReference interval supplied by this synthetic laboratory: 12.0–15.5 g/dL\nThis is fabricated training data, not a patient report.'],
    ['d5', 'Appointment confirmation', 'other', '2026-10-25', 'Demo clinic', 'SYNTHETIC SAMPLE — Appointment confirmation\nIssued: 25 October 2026\nAppointment: 31 October 2026 at 10:30\nThis differs from the referral letter. Contact the care team to confirm.'],
  ];
  const documents = docs.map(([id, name, category, date, facility, originalText]) => ({ id, name, category, date, facility, originalText, mimeType: 'text/plain', size: originalText.length, version: 'fixture-v1', extraction: 'fixture' as const, patientReviewed: id === 'd1', clinicianVerified: id === 'd1', addedAt: fixtureTime }));
  const ledger: Evidence[] = documents.map(d => ({ id: `e-${d.id}`, kind: 'document', title: d.name, titleTa: ({ d1: 'இரத்த எண்ணிக்கை · 14 அக்டோபர்', d2: 'பரிந்துரைக் கடிதம்', d3: 'படப்பரிசோதனை அறிக்கை', d4: 'இரத்த எண்ணிக்கை · 24 அக்டோபர்', d5: 'சந்திப்பு உறுதிப்படுத்தல்' } as Record<string,string>)[d.id]!, date: d.date, status: d.clinicianVerified ? 'clinician-confirmed' : 'extracted', source: { documentId: d.id, page: 1, quote: d.originalText!.split('\n')[1]!, version: d.version, method: 'synthetic-fixture', confidence: 'not-applicable', ...(d.clinicianVerified ? { reviewer: 'Demo clinician (fixture)', reviewedAt: fixtureTime } : {}) } }));
  for (const d of documents.filter(d => d.category==='laboratory')) {
    const value=Number(d.originalText!.match(/Haemoglobin: ([\d.]+)/)![1]);
    ledger.push({ id:`lab-${d.id}`,kind:'document',title:`Haemoglobin as documented: ${value} g/dL`,titleTa:`அறிக்கையில் உள்ள ஹீமோகுளோபின்: ${value} g/dL`,date:d.date,status:d.clinicianVerified ? 'clinician-confirmed' : 'extracted',observation:{ test:'haemoglobin',value,unit:'g/dL',referenceLow:12,referenceHigh:15.5 },source:{ documentId:d.id,page:1,quote:d.originalText!.split('\n').slice(3,5).join('\n'),version:d.version,method:'synthetic-fixture',confidence:'not-applicable',...(d.clinicianVerified ? { reviewer:'Demo clinician (fixture)',reviewedAt:fixtureTime } : {}) } });
  }
  ledger.push(...[
    { id: 'a1', date: '2026-10-30', documentId: 'd2', quote: 'Appointment: 30 October 2026 at 10:30', title: 'Appointment date needs confirmation', titleTa: 'சந்திப்பு தேதியை உறுதிப்படுத்தவும்' },
    { id: 'a2', date: '2026-10-31', documentId: 'd5', quote: 'Appointment: 31 October 2026 at 10:30', title: 'A second date appears in your records', titleTa: 'பதிவுகளில் மற்றொரு தேதி உள்ளது' },
  ].map(e => ({ id: e.id, kind: 'appointment' as const, title: e.title, titleTa: e.titleTa, date: e.date, status: 'conflicting' as const, source: { documentId: e.documentId, page: 1, quote: e.quote, version: 'fixture-v1', method: 'synthetic-fixture' as const, confidence: 'not-applicable' as const } })));
  return { version: 1, mode: 'demo', locale: 'en', onboarded: false, reducedMotion: false, documents, ledger,
    checks: [
      { id: 'c1', label: 'Review the reports I want to bring', labelTa: 'எடுத்துச் செல்லும் அறிக்கைகளைப் பார்க்கவும்', done: false, enabled: true, optional: false },
      { id: 'c2', label: 'Prepare my questions', labelTa: 'என் கேள்விகளைத் தயாரிக்கவும்', done: true, enabled: true, optional: false },
      { id: 'c3', label: 'Confirm my appointment details', labelTa: 'சந்திப்பு விவரங்களை உறுதிப்படுத்தவும்', done: false, enabled: true, optional: false },
      { id: 'c4', label: 'Add personal notes', labelTa: 'தனிப்பட்ட குறிப்புகளைச் சேர்க்கவும்', done: false, enabled: true, optional: true },
    ], questions: [{ id: 'q1', text: 'Which appointment date should I use?', answered: false, at: fixtureTime }], notes: '', selected: ['d1', 'd2'], grants: [], observations: [], flags: [],drafts:{ question:'',notes:'',check:'',recipient:'',purpose:'',missingText:'',missingNote:'',observation:'',flag:'' },
    missing: [{ id: 'm1', text: 'A copy of my referral', note: 'My own checklist, not a medical requirement.', source: 'patient', status: 'missing' }], audit: [] };
}
export function records(s: State, category = 'all', query = '', sort: 'newest' | 'oldest' = 'newest') {
  const term = query.trim().toLocaleLowerCase();
  return s.documents.filter(d => (category === 'all' || d.category === category) && `${d.name} ${d.facility}`.toLocaleLowerCase().includes(term)).sort((a,b) => sort === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
}
export function timeline(s: State, kind = 'all', from = '', to = '') {
  return s.ledger.filter(e => s.documents.some(d => d.id === e.source.documentId) && e.source.quote && (kind === 'all' || e.kind === kind) && (!from || e.date >= from) && (!to || e.date <= to)).sort((a,b) => b.date.localeCompare(a.date));
}
export function readiness(s: State) {
  const checks = s.checks.filter(c => c.enabled && !c.optional);
  return { done: checks.filter(c => c.done).length, total: checks.length };
}
export function validateFile(f: { name: string; mimeType?: string; size?: number }): string | null {
  if (!f.size || f.size < 1 || f.size > 25 * 1024 * 1024) return 'size';
  const types: Record<string, RegExp> = { 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i };
  return f.mimeType && types[f.mimeType]?.test(f.name) ? null : 'type';
}
export type Action =
  | { type:'editQuestion';id:string;text:string }
  | { type:'removeQuestion';id:string;approved:boolean }
  | { type:'draft';key:DraftKey;text:string }
  | { type: 'locale'; locale: Locale } | { type: 'onboard' | 'leave' } | { type: 'motion' }
  | { type: 'review'; id: string } | { type: 'flag'; id: string; reason: string }
  | { type: 'check' | 'enableCheck' | 'select' | 'answer' | 'revoke'; id: string }
  | { type: 'addCheck' | 'question'; text: string } | { type: 'notes'; text: string }
  | { type: 'missing'; text: string; note: string }
  | { type: 'missingStatus'; id: string; status: State['missing'][number]['status']; documentId?: string }
  | { type: 'wellbeing'; text: string; intensity: number }
  | { type: 'import'; document: DocumentRecord }
  | { type: 'share'; recipient: string; purpose: string; ids: string[]; expiresAt: string; approved: boolean }
  | { type: 'export'; ids: string[]; approved: boolean };
function textInput(text: string, max = 1000) { const t = text.trim(); if (!t || t.length > max) throw new Error('invalid_input'); return t; }
function owned(s: State, ids: string[]) { if (!ids.length || ids.some(id => !s.documents.some(d => d.id === id))) throw new Error('invalid_scope'); }
export function reduce(s: State, a: Action, at = new Date().toISOString()): State {
  const id = `local-${Date.parse(at)}-${s.audit.length}`;
  let next: State = s; let action: string = a.type; let entityId = 'profile';
  switch (a.type) {
    case 'draft': if (!(a.key in s.drafts) || a.text.length>5000) throw new Error('invalid_input');return { ...s,drafts:{ ...s.drafts,[a.key]:a.text } };
    case 'locale': if (!['en','ta'].includes(a.locale)) throw new Error('invalid_input'); next = { ...s, locale: a.locale }; break;
    case 'onboard': next = { ...s, onboarded: true }; break;
    case 'leave': next = { ...s, onboarded: false }; break;
    case 'motion': next = { ...s, reducedMotion: !s.reducedMotion }; break;
    case 'review': owned(s,[a.id]); next = { ...s, documents: s.documents.map(d => d.id === a.id ? { ...d, patientReviewed: true } : d) }; action = 'patient_review'; entityId = a.id; break;
    case 'flag': owned(s,[a.id]); next = { ...s, flags: [...s.flags, { id, documentId: a.id, reason: textInput(a.reason), at }] }; entityId = a.id; break;
    case 'check': case 'enableCheck':
      if (!s.checks.some(c => c.id === a.id)) throw new Error('unknown_item');
      next = { ...s, checks: s.checks.map(c => c.id === a.id ? { ...c, ...(a.type === 'check' ? { done: !c.done } : { enabled: !c.enabled }) } : c) }; entityId = a.id; break;
    case 'addCheck': next = { ...s, checks: [...s.checks, { id, label: textInput(a.text, 200), done: false, enabled: true, optional: false }] }; break;
    case 'question': next = { ...s, questions: [...s.questions, { id, text: textInput(a.text), answered: false, at }] }; break;
    case 'editQuestion': if (!s.questions.some(q => q.id===a.id)) throw new Error('unknown_item');next={ ...s,questions:s.questions.map(q => q.id===a.id ? { ...q,text:textInput(a.text) } : q) };entityId=a.id;break;
    case 'removeQuestion': if (!a.approved) throw new Error('approval_required');if (!s.questions.some(q => q.id===a.id)) throw new Error('unknown_item');next={ ...s,questions:s.questions.filter(q => q.id!==a.id) };entityId=a.id;break;
    case 'answer': if (!s.questions.some(q => q.id === a.id)) throw new Error('unknown_item'); next = { ...s, questions: s.questions.map(q => q.id === a.id ? { ...q, answered: !q.answered } : q) }; entityId = a.id; break;
    case 'notes': if (a.text.length > 5000) throw new Error('invalid_input'); next = { ...s, notes: a.text,drafts:{ ...s.drafts,notes:a.text } }; break;
    case 'select': owned(s,[a.id]); next = { ...s, selected: s.selected.includes(a.id) ? s.selected.filter(i => i !== a.id) : [...s.selected, a.id] }; entityId = a.id; break;
    case 'missing': next = { ...s, missing: [...s.missing, { id, text: textInput(a.text,200), note: a.note.trim().slice(0,1000), source: 'patient', status: 'missing' }] }; break;
    case 'missingStatus':
      if (!s.missing.some(m => m.id === a.id)) throw new Error('unknown_item');
      if (a.documentId) owned(s,[a.documentId]);
      next = { ...s, missing: s.missing.map(m => m.id === a.id ? { ...m, status: a.status, documentId: a.documentId } : m) }; entityId = a.id; break;
    case 'wellbeing':
      if (!Number.isInteger(a.intensity) || a.intensity < 1 || a.intensity > 5) throw new Error('invalid_input');
      next = { ...s, observations: [{ id, text: textInput(a.text), intensity: a.intensity, source: 'patient-reported', at }, ...s.observations] }; break;
    case 'import':
      if (s.documents.some(d => d.id === a.document.id) || validateFile(a.document) || a.document.clinicianVerified || a.document.extraction !== 'unavailable' || !a.document.uri) throw new Error('invalid_document');
      next = { ...s, documents: [...s.documents, a.document] }; entityId = a.document.id; break;
    case 'share':
      if (!a.approved) throw new Error('approval_required'); owned(s,a.ids);
      if (!Number.isFinite(Date.parse(a.expiresAt)) || Date.parse(a.expiresAt) <= Date.parse(at) || Date.parse(a.expiresAt) - Date.parse(at) > 30 * 86400000) throw new Error('invalid_expiry');
      next = { ...s, grants: [{ id, recipient: textInput(a.recipient,200), purpose: textInput(a.purpose,500), ids: [...new Set(a.ids)], expiresAt: a.expiresAt, simulated: true, createdAt: at }, ...s.grants] }; break;
    case 'revoke': if (!s.grants.some(g => g.id === a.id)) throw new Error('unknown_item'); next = { ...s, grants: s.grants.map(g => g.id === a.id ? { ...g, revokedAt: at } : g) }; entityId = a.id; break;
    case 'export': buildPacket(s,a.ids,a.approved); action = 'packet_export_requested'; break;
  }
  return { ...next, audit: [...s.audit, { id, actor: 'demo-patient', action, entityId, at }] };
}
export function buildPacket(s: State, ids: string[], approved: boolean): string {
  if (!approved) throw new Error('approval_required'); owned(s, ids);
  if (s.locale==='ta') return ['ONCOBRIEF — SYNTHETIC · கற்பனை சந்திப்புத் தொகுப்பு',translate('ta','packetInfo'),
    ...s.documents.filter(d => ids.includes(d.id)).map(d => `${d.name} | ${d.date} | ${d.facility} | ${d.version}\n${translate('ta',d.patientReviewed ? 'patientReviewed' : 'notReviewed')} · ${translate('ta',d.clinicianVerified ? 'confirmed' : 'extracted')}`),
    translate('ta','source'),...s.ledger.filter(e => ids.includes(e.source.documentId)).map(e => `${e.date}: ${e.titleTa} [${translate('ta',e.status==='conflicting' ? 'conflicting' : e.status==='clinician-confirmed' ? 'confirmed' : 'extracted')}]\n${translate('ta','source')} ${e.source.documentId}, ${translate('ta','page')} ${e.source.page}, ${e.source.version}: "${e.source.quote}"`),
    translate('ta','questions'),...s.questions.filter(q => !q.answered).map(q => q.text),translate('ta','notes'),s.notes,translate('ta','checklist'),...s.missing.map(m => `${m.text}: ${translate('ta',m.status)} (${translate('ta','missingInfo')})`) ].join('\n\n');
  return ['ONCOBRIEF — SYNTHETIC CONSULTATION PACK', 'Personal preparation only. No clinical sign-off. No original file attachments.',
    ...s.documents.filter(d => ids.includes(d.id)).map(d => `${d.name} | ${d.date} | ${d.facility} | ${d.version}\nPatient reviewed: ${d.patientReviewed}; clinician confirmed (fixture): ${d.clinicianVerified}`),
    'SOURCE-LINKED FACTS AND UNCERTAINTIES', ...s.ledger.filter(e => ids.includes(e.source.documentId)).map(e => `${e.date}: ${e.title} [${e.status}]\nSource ${e.source.documentId}, page ${e.source.page}, ${e.source.version}: "${e.source.quote}"`),
    'MY QUESTIONS', ...s.questions.filter(q => !q.answered).map(q => q.text), 'MY NOTES', s.notes, 'MY RECORD CHECKLIST', ...s.missing.map(m => `${m.text}: ${m.status} (patient-maintained)`) ].join('\n\n');
}
export function hydrate(raw: string): State {
  if (raw.length > 5 * 1024 * 1024) throw new Error('invalid_storage');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('invalid_storage');
  const s = parsed as State;
  if (s.version !== 1 || s.mode !== 'demo' || !['en','ta'].includes(s.locale) || typeof s.onboarded !== 'boolean' || typeof s.reducedMotion !== 'boolean' || typeof s.notes !== 'string') throw new Error('invalid_storage');
  for (const key of ['documents','ledger','checks','questions','selected','grants','observations','missing','flags','audit'] as const) if (!Array.isArray(s[key])) throw new Error('invalid_storage');
  if (s.documents.some(d => !d || typeof d.id !== 'string' || typeof d.name !== 'string' || !['laboratory','pathology','imaging','referral','prescription','other'].includes(d.category) || typeof d.date !== 'string' || typeof d.patientReviewed !== 'boolean' || typeof d.clinicianVerified !== 'boolean' || !['fixture','unavailable'].includes(d.extraction))) throw new Error('invalid_storage');
  const fixture=createDemo();
  // No mobile action can author clinical evidence. Only the bundled source-anchored fixture ledger is accepted.
  if (JSON.stringify(s.ledger)!==JSON.stringify(fixture.ledger)) throw new Error('invalid_storage');
  if (fixture.documents.some(original => { const d=s.documents.find(d => d.id===original.id);return !d || Object.entries(original).some(([key,value]) => key!=='patientReviewed' && d[key as keyof DocumentRecord]!==value); })) throw new Error('invalid_storage');
  if (s.documents.some(d => d.extraction==='fixture' && !fixture.documents.some(f => f.id===d.id))) throw new Error('invalid_storage');
  if (s.checks.some(c => typeof c.label !== 'string' || typeof c.done !== 'boolean' || typeof c.enabled !== 'boolean') || s.questions.some(q => typeof q.text !== 'string') || s.selected.some(id => !s.documents.some(d => d.id === id))) throw new Error('invalid_storage');
  if (s.grants.some(g => !g || !g.simulated || typeof g.recipient!=='string' || !g.recipient.trim() || typeof g.purpose!=='string' || !g.purpose.trim() || !Number.isFinite(Date.parse(g.expiresAt)) || !Number.isFinite(Date.parse(g.createdAt)) || !Array.isArray(g.ids) || !g.ids.length || g.ids.some(id => !s.documents.some(d => d.id === id))) || s.observations.some(o => !o || o.source !== 'patient-reported' || !Number.isInteger(o.intensity) || o.intensity < 1 || o.intensity > 5 || typeof o.text !== 'string') || s.missing.some(m => !m || m.source !== 'patient' || typeof m.text !== 'string' || !['missing','requested','available','unavailable'].includes(m.status)) || s.audit.some(e => !e || e.actor !== 'demo-patient' || typeof e.action !== 'string')) throw new Error('invalid_storage');
  if (s.documents.some(d => d.extraction==='unavailable' && (d.clinicianVerified || d.originalText || !d.uri?.startsWith('file://') || !d.uri.includes('/oncobrief-demo/'))) || s.flags.some(f => !f || typeof f.reason!=='string' || !s.documents.some(d => d.id===f.documentId))) throw new Error('invalid_storage');
  const string=(v:unknown):v is string => typeof v==='string';
  const date=(v:unknown) => string(v) && Number.isFinite(Date.parse(v));
  for (const list of [s.documents,s.checks,s.questions,s.grants,s.observations,s.missing,s.flags,s.audit]) if (list.some(v => !v || !string(v.id)) || new Set(list.map(v => v.id)).size!==list.length) throw new Error('invalid_storage');
  if (s.documents.some(d => !string(d.facility) || !string(d.mimeType) || !Number.isFinite(d.size) || d.size<1 || !string(d.version) || !date(d.addedAt)) || s.checks.some(c => typeof c.optional!=='boolean' || (c.labelTa!==undefined && !string(c.labelTa))) || s.questions.some(q => typeof q.answered!=='boolean' || !date(q.at)) || s.missing.some(m => !string(m.note) || (m.documentId!==undefined && !s.documents.some(d => d.id===m.documentId))) || s.observations.some(o => !date(o.at)) || s.flags.some(f => !date(f.at)) || s.audit.some(e => !string(e.entityId) || !date(e.at))) throw new Error('invalid_storage');
  if (!s.drafts || Object.keys(fixture.drafts).some(key => !string(s.drafts[key as DraftKey]) || s.drafts[key as DraftKey].length>5000)) throw new Error('invalid_storage');
  return s;
}
export interface PatientGateway { load(): Promise<State> }
export const productionGateway: PatientGateway = { async load() { throw new Error('Patient authentication and authorization are not configured.'); } };
