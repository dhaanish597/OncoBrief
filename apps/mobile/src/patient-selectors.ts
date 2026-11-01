import { timeline, type State, type Evidence } from './domain';
export interface LabObservation {
  id:string;test:string;value:number;unit:string;date:string;documentId:string;documentName:string;
  facility:string;quote:string;page:number;version:string;status:Evidence['status'];patientReviewed:boolean;
  category:string;reference?:{ low:number;high:number;unit:string };
}
export function labObservations(s:State):LabObservation[] {
  return s.ledger.flatMap(e => {
    const o=e.observation;const d=s.documents.find(d => d.id===e.source.documentId);
    if (!o || !d || !Number.isFinite(o.value) || !e.source.quote || !d.originalText?.includes(e.source.quote)) return [];
    return [{ id:e.id,test:o.test,value:o.value,unit:o.unit,date:e.date,documentId:d.id,documentName:d.name,facility:d.facility,quote:e.source.quote,page:e.source.page,version:e.source.version,status:e.status,patientReviewed:d.patientReviewed,category:'blood',reference:Number.isFinite(o.referenceLow) && Number.isFinite(o.referenceHigh) ? { low:o.referenceLow,high:o.referenceHigh,unit:o.unit } : undefined }];
  }).sort((a,b) => b.date.localeCompare(a.date));
}
export function filterLabs(data:LabObservation[],options:{ query?:string;category?:string;from?:string;to?:string }={}) {
  if (!validDateRange(options.from || '',options.to || '')) return [];
  const q=options.query?.trim().toLowerCase() || '';
  return data.filter(o => (!q || `${o.test} ${o.documentName} ${o.facility}`.toLowerCase().includes(q)) && (!options.category || options.category==='all' || o.category===options.category) && (!options.from || o.date>=options.from) && (!options.to || o.date<=options.to));
}
export function comparison(latest:LabObservation,earlier?:LabObservation):{ kind:'higher'|'lower'|'unchanged'|'incompatible'|'no-earlier';delta?:number } {
  if (!earlier) return { kind:'no-earlier' };
  if (latest.test!==earlier.test || latest.unit!==earlier.unit || latest.facility!==earlier.facility || !Number.isFinite(latest.value) || !Number.isFinite(earlier.value)) return { kind:'incompatible' };
  const delta=Math.round((latest.value-earlier.value)*1000000)/1000000;
  return { kind:delta>0 ? 'higher' : delta<0 ? 'lower' : 'unchanged',delta };
}
export function referenceInterval(o:LabObservation) {
  const r=o.reference;
  if (!r || r.unit!==o.unit || ![r.low,r.high,o.value].every(Number.isFinite) || r.low>=r.high) return null;
  return { low:r.low,high:r.high,unit:r.unit };
}
export const referencePosition = referenceInterval;
export const historyRanges=['1M','3M','6M','1Y','All'] as const;
export type HistoryRange=typeof historyRanges[number];
/** Windows anchor to the latest available source date, never a fabricated observation. */
export function historyStart(data:LabObservation[],range:HistoryRange) {
  if (range==='All' || !data.length) return '';
  const last=data.reduce((a,b) => a.date>b.date ? a : b);const d=new Date(`${last.date.slice(0,10)}T00:00:00Z`);
  const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-({ '1M':1,'3M':3,'6M':6,'1Y':12 }[range]));const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);
}
export function filterJourney(s:State,options:{ category?:string;query?:string;from?:string;to?:string;sort?:'oldest'|'newest' }={}) {
  const q=options.query?.trim().toLocaleLowerCase() || '';
  const events=timeline(s,'all',options.from,options.to).filter(e => {
    const d=s.documents.find(d => d.id===e.source.documentId);
    return (!options.category || options.category==='all' || e.kind===options.category || d?.category===options.category) && (!q || `${e.title} ${e.titleTa} ${e.source.quote} ${d?.facility}`.toLocaleLowerCase().includes(q));
  });
  return options.sort==='oldest' ? events.reverse() : events;
}
export function calendarDay(at:string,timeZone?:string) {
  const parts=new Intl.DateTimeFormat('en-CA',{ year:'numeric',month:'2-digit',day:'2-digit',...(timeZone ? { timeZone } : {}) }).formatToParts(new Date(at));
  return ['year','month','day'].map(key => parts.find(p => p.type===key)?.value).join('-');
}
export function validDateRange(from:string,to:string) {
  const valid=(s:string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
  return valid(from) && valid(to) && (!from || !to || from<=to);
}
export function wellbeingHistory(s:State,from='',to='',timeZone?:string) {
  if (!validDateRange(from,to)) return [];
  return s.observations.filter(o => { const day=calendarDay(o.at,timeZone);return (!from || day>=from) && (!to || day<=to); }).sort((a,b) => b.at.localeCompare(a.at));
}
