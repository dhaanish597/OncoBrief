'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import type { OpdStatus } from '@oncobrief/domain';
import type { listOpdWorkspace, listBackfillCandidates } from '@oncobrief/db';
import { ReadinessBand } from '@/components/evidence';
import { backfillOpdSlotAction, discoverBackfillCandidatesAction, registerWalkInAction, updateOpdSlotStatusAction } from '@/lib/opd-actions';
import { filterOpdSlots, metricRatio, opdStatusLabel } from '@/lib/opd-presentation';

type Workspace = Awaited<ReturnType<typeof listOpdWorkspace>>;
type Slot = Workspace['slots'][number];
type Candidate = Awaited<ReturnType<typeof listBackfillCandidates>>[number];
const control = 'rounded border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] px-3 py-2 text-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
export function OpdWorkspace({ workspace, transitions, canManage, containsSyntheticData, worklist }: { workspace: Workspace; transitions: Record<OpdStatus, readonly OpdStatus[]>; canManage: boolean; containsSyntheticData: boolean; worklist: ReactNode }) {
  const [view, setView] = useState('readiness');
  const [filter, setFilter] = useState('all');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [mode, setMode] = useState<'status'|'offer'|'walk_in'>('status');
  const [toStatus, setToStatus] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const m = workspace.metrics;
  function open(row: Slot, nextMode: typeof mode, status = '') {
    setSlot(row); setMode(nextMode); setToStatus(status); setCandidates([]); setSelected(''); setReason(''); setConfirmed(false); setError(''); setRequestId(crypto.randomUUID());
    if (nextMode !== 'status') startTransition(async () => {
      const result = await discoverBackfillCandidatesAction(row.id);
      if (result.ok) setCandidates(result.data); else setError(result.error);
    });
  }
  function submit() {
    if (!slot) return;
    const fd = new FormData();
    fd.set('slotId', slot.id); fd.set('requestId', requestId); fd.set('confirmed', confirmed ? 'yes' : 'no');
    fd.set('expectedStatus', slot.status); fd.set('toStatus', toStatus); fd.set('reason', reason); fd.set('waitlistEntryId', selected);
    startTransition(async () => {
      const action = mode === 'status' ? updateOpdSlotStatusAction : mode === 'offer' ? backfillOpdSlotAction : registerWalkInAction;
      const result = await action(fd);
      if (!result.ok) { setError(result.error); return; }
      setNotice(mode === 'offer' ? 'Offer reserved and audited. Patient acceptance has not been recorded; no message was sent.' : 'Clinic update saved and audited.');
      setSlot(null); router.refresh();
    });
  }
  return <>
    <div className="mt-6 flex flex-wrap gap-2" aria-label="Workspace view">
      <button className={control} aria-pressed={view === 'opd'} onClick={() => setView('opd')}>Live oncology OPD</button>
      <button className={control} aria-pressed={view === 'readiness'} onClick={() => setView('readiness')}>Readiness worklist</button>
    </div>
    {notice && <p role="status" className="mt-4 border p-3 text-sm">{notice}</p>}
    {view === 'readiness' ? worklist : <section aria-labelledby="opd-heading" data-testid="opd-workspace">
      {containsSyntheticData && <p className="mt-4 border border-[var(--color-rule-strong)] p-3 text-sm">Synthetic oncology demo records are present. Operational measurements include fixture data and do not establish real hospital impact.</p>}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="opd-heading" className="text-xl font-semibold">Oncology clinic flow</h2><p className="mt-1 text-sm text-[var(--color-ink-soft)]">{workspace.date} · clinic-local dates · facility default {workspace.timeZone}</p></div>
        <form className="flex gap-2" action="/workspace"><label className="text-sm">Clinic date <input className={control} type="date" name="date" defaultValue={workspace.date} required /></label><button className={control}>View date</button></form>
      </div>
      <details className="mt-4 border border-[var(--color-rule)] p-3"><summary className="cursor-pointer text-sm font-medium">Operational measurements · stored records</summary>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          {[['Consultation-ready rate',metricRatio(m.ready,m.scheduled)],['Promotion gate pass rate',metricRatio(m.spanPassed,m.spanTotal)],['Contradictions before consultation',String(m.contradictions)],['OPD slot utilization',metricRatio(m.utilized,m.totalSlots)],['Successful slot backfills',String(m.successfulBackfills)],['Outstanding administrative tasks',String(m.outstandingTasks)]].map(([label,value]) => <div key={label}><dt className="text-[var(--color-ink-soft)]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
        </dl><p className="mt-3 text-xs text-[var(--color-ink-soft)]">Readiness: ready patients / active or completed appointments (cancelled, no-show and vacant excluded). Utilization: active or completed appointments / stored slots on this clinic date; unaccepted offers are excluded. Promotion gate: promoted / completed promoted or rejected extraction candidates; this is not a measurement of every span-validation attempt. Contradictions: source conflicts detected before the first recorded consultation start for queued patients, including subsequently resolved conflicts. Backfills count confirmed walk-in assignments; offers are excluded. Tasks count open administrative tasks. Empty denominators are unavailable. Synthetic fixture records measure demo behavior, not hospital impact. The under-five-second recommendation time is a pilot objective.</p>
      </details>
      <div className="my-4 flex flex-wrap gap-2" aria-label="Appointment status filters">
        {['all','scheduled','checked_in','in_consult','delayed_investigation','cancelled','walk_in','completed','vacant'].map(status => <button key={status} className={control} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'all' ? 'All oncology appointments' : opdStatusLabel(status)}</button>)}
      </div>
      <p className="mb-2 text-xs text-[var(--color-ink-soft)] sm:hidden">Scroll the appointment table horizontally to inspect readiness and available actions.</p>
      <div tabIndex={0} role="region" aria-label="Scrollable oncology appointment table" className="overflow-x-auto border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
        <table className="w-full min-w-[1000px] text-left text-sm"><caption className="sr-only">Persisted oncology OPD appointments</caption><thead className="border-b text-xs uppercase text-[var(--color-ink-soft)]"><tr>{['Time / token','Patient','Room','Status / check-in','Record readiness','Administrative priority','Blockers','Actions'].map(h => <th className="p-3" scope="col" key={h}>{h}</th>)}</tr></thead>
          <tbody>{filterOpdSlots(workspace.slots,filter).map(row => <tr key={row.id} data-testid={`opd-slot-${row.id}`} className="border-b border-[var(--color-rule)]">
            <td className="p-3"><span className="mono">{row.slot_start_time.slice(0,5)}–{row.slot_end_time.slice(0,5)}</span><span className="block text-xs">{row.clinic_timezone}</span><span className="block text-xs">Token {row.token_number ?? '—'}</span></td>
            <td className="p-3">{row.patient_id ? <Link className="underline" href={`/patients/${row.patient_id}/evidence`}>{row.patient_name}</Link> : 'Vacant'}{row.offered_patient_name && <span className="mt-1 block text-xs">Reserved offer: {row.offered_patient_name}<br/>Acceptance pending</span>}</td>
            <td className="p-3">{row.room_label}</td><td className="p-3">{opdStatusLabel(row.status)}<span className="block text-xs">{row.checked_in_at ? 'Arrival recorded' : 'Not checked in'}</span></td>
            <td className="p-3">{row.patient_id ? <ReadinessBand band={row.readiness_band}/> : '—'}</td>
            <td className="p-3"><span>{row.priority_provenance ? row.priority_tag.replaceAll('_',' ') : 'Routine operational order'}</span><span className="block text-xs text-[var(--color-ink-soft)]">{row.priority_provenance ?? 'No documented priority'}</span></td>
            <td className="p-3 text-xs">{row.bottleneck_note || row.readiness_reasons.join(' · ') || 'None recorded'}</td>
            <td className="p-3">{canManage ? <div className="flex flex-wrap gap-2">{(transitions[row.status as OpdStatus] ?? []).map(status => <button className={control} key={status} onClick={() => open(row,'status',status)}>{status === 'vacant' ? 'Release slot' : opdStatusLabel(status)}</button>)}{row.status === 'vacant' && !row.offer_waitlist_id && <><button className={control} onClick={() => open(row,'offer')}>Review backfill candidates</button><button className={control} onClick={() => open(row,'walk_in')}>Register walk-in</button></>}{row.offer_waitlist_id && <button className={control} onClick={() => open(row,'status','vacant')}>Release offer</button>}</div> : <span className="text-xs">Read only</span>}</td>
          </tr>)}{filterOpdSlots(workspace.slots,filter).length === 0 && <tr><td colSpan={8} className="p-8 text-center text-[var(--color-ink-soft)]">No persisted slots match this date and filter. Capacity must be configured before scheduling.</td></tr>}</tbody>
        </table>
      </div>
    </section>}
    <Dialog.Root open={slot !== null} onOpenChange={value => { if (!value && !pending) setSlot(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/40"/><Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto bg-[var(--color-paper-raised)] p-6 shadow-xl" aria-describedby="opd-dialog-description">
      <Dialog.Title className="pr-12 text-xl font-semibold">{mode === 'status' ? `Confirm ${opdStatusLabel(toStatus).toLowerCase()}` : mode === 'offer' ? 'Ready waitlist · review slot offer' : 'Register a ready waitlisted walk-in'}</Dialog.Title>
      <Dialog.Description id="opd-dialog-description" className="mt-3 text-sm">{slot?.slot_start_time.slice(0,5)} · {slot?.room_label} · {workspace.date}. Record ready means administrative documents are verified; it is not clinical clearance.</Dialog.Description>
      <Dialog.Close className={`${control} absolute right-3 top-3`} disabled={pending} aria-label="Close clinic action">Close</Dialog.Close>
      {mode === 'status' ? <label className="mt-6 block text-sm">Operational reason (required)<textarea className={`${control} mt-2 block w-full`} maxLength={500} minLength={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Record an operational reason without unnecessary patient details"/></label> : <div className="mt-6">
        <p className="text-sm">{mode === 'offer' ? 'Staff confirmation reserves an offer only. It records neither acceptance nor attendance and sends no message.' : 'Use an existing vacant slot and a ready waitlist entry. Registration does not add clinic capacity.'}</p>
        {pending && !candidates.length && <p role="status" className="mt-4">Checking current readiness and scheduling eligibility…</p>}
        {!pending && !candidates.length && !error && <p className="mt-4 border p-4">No eligible consultation-ready waitlisted patients are available for this slot.</p>}
        <fieldset className="mt-4 space-y-3"><legend className="sr-only">Eligible candidates</legend>{candidates.map(candidate => <label key={candidate.waitlistEntryId} className="block border border-[var(--color-rule-strong)] p-3"><input type="radio" name="candidate" value={candidate.waitlistEntryId} checked={selected === candidate.waitlistEntryId} onChange={e => setSelected(e.target.value)}/><span className="ml-2 font-medium">{candidate.patientName}</span><span className="mt-2 block"><ReadinessBand band={candidate.readinessBand}/></span><span className="mt-2 block text-sm">{candidate.rationale}</span><span className="mt-2 block text-xs">Requested {candidate.requestedDate} · {candidate.priorityTag.replaceAll('_',' ')}</span><span className="block text-xs">Priority provenance: {candidate.prioritySourceQuote ?? candidate.priorityProvenance ?? 'Routine operational order'}</span></label>)}</fieldset>
      </div>}
      {error && <p role="alert" className="mt-4 border border-red-700 p-3 text-sm">{error}</p>}
      <label className="mt-6 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I reviewed these details and explicitly confirm this operational action.</label>
      <button className={`${control} mt-4 w-full font-semibold`} disabled={pending || !confirmed || (mode === 'status' ? reason.trim().length < 3 : !selected)} onClick={submit}>{pending ? 'Saving…' : mode === 'offer' ? 'Confirm slot offer' : mode === 'walk_in' ? 'Confirm walk-in registration' : 'Confirm status update'}</button>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
