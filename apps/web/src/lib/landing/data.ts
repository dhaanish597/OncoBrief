export type EvidenceStatus = 'VERIFIED' | 'PENDING' | 'CONFLICT' | 'SUPERSEDED'

export const ROUTES = {
  explore: '#surfaces',
  howItWorks: '#how-it-works',
  workspace: '/workspace',
} as const

export const NAV_LINKS = [
  { label: 'The problem', href: '#problem' },
  { label: 'The evidence', href: '#evidence' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Safety', href: '#safety' },
] as const

export const STATUS_STYLES: Record<EvidenceStatus, { text: string; dot: string; border: string }> = {
  VERIFIED: { text: 'text-teal', dot: 'bg-teal', border: 'border-teal' },
  PENDING: { text: 'text-amber', dot: 'bg-amber', border: 'border-amber' },
  CONFLICT: { text: 'text-alert', dot: 'bg-alert', border: 'border-alert' },
  SUPERSEDED: { text: 'text-ink-soft', dot: 'bg-ink-soft', border: 'border-ink-soft' },
}

export type DocKind = 'pathology' | 'imaging' | 'referral' | 'discharge' | 'handwritten' | 'chemo'

export interface RecordDoc {
  id: string
  kind: DocKind
  title: string
  source: string
  page: string
  version: string
  status: EvidenceStatus
  received: string
  note: string
}

export const RECORD_DOCS: RecordDoc[] = [
  {
    id: 'SRC-0412',
    kind: 'pathology',
    title: 'Histopathology report',
    source: 'Pathology lab · external',
    page: 'p. 2 / 3',
    version: 'v2',
    status: 'VERIFIED',
    received: '2026-02-14 09:42',
    note: 'Addendum received; v2 replaces v1 as the current report.',
  },
  {
    id: 'SRC-0398',
    kind: 'imaging',
    title: 'CT chest / abdomen',
    source: 'Radiology · regional centre',
    page: 'p. 1 / 2',
    version: 'v1',
    status: 'CONFLICT',
    received: '2026-02-11 16:05',
    note: 'Study date differs from the date quoted in the referral letter.',
  },
  {
    id: 'SRC-0421',
    kind: 'referral',
    title: 'Referral letter',
    source: 'Primary care · fax',
    page: 'p. 1 / 1',
    version: 'v1',
    status: 'PENDING',
    received: '2026-02-16 11:20',
    note: 'Awaiting clinician review of referral reason.',
  },
  {
    id: 'SRC-0377',
    kind: 'discharge',
    title: 'Discharge summary',
    source: 'Inpatient ward',
    page: 'p. 3 / 4',
    version: 'v1',
    status: 'VERIFIED',
    received: '2026-01-29 18:31',
    note: 'Medication list extracted and linked to page 3.',
  },
  {
    id: 'SRC-0409',
    kind: 'handwritten',
    title: 'Handwritten clinic note',
    source: 'Outpatient · scanned',
    page: 'p. 1 / 1',
    version: 'v1',
    status: 'PENDING',
    received: '2026-02-13 10:02',
    note: 'Low-confidence OCR regions flagged for human reading.',
  },
  {
    id: 'SRC-0366',
    kind: 'chemo',
    title: 'Chemotherapy sheet',
    source: 'Day unit',
    page: 'p. 1 / 2',
    version: 'v3',
    status: 'VERIFIED',
    received: '2026-01-22 08:15',
    note: 'Cycle record linked; previous versions retained in history.',
  },
  {
    id: 'SRC-0390',
    kind: 'pathology',
    title: 'Histopathology report',
    source: 'Pathology lab · external',
    page: 'p. 2 / 3',
    version: 'v1',
    status: 'SUPERSEDED',
    received: '2026-02-09 14:48',
    note: 'Superseded by SRC-0412 (v2). Kept for provenance, not used for current facts.',
  },
]

export const KIND_LABEL: Record<DocKind, string> = {
  pathology: 'Pathology',
  imaging: 'Imaging',
  referral: 'Referral',
  discharge: 'Discharge',
  handwritten: 'Handwritten',
  chemo: 'Chemotherapy',
}

export interface LedgerRow {
  id: string
  fact: string
  value: string
  sourceId: string
  sourceTitle: string
  page: string
  version: string
  review: EvidenceStatus
  task: string | null
  phrase: string
  context: [string, string]
  audit: { at: string; who: string; what: string }[]
}

export const LEDGER_ROWS: LedgerRow[] = [
  {
    id: 'EV-1042',
    fact: 'Histology (as reported)',
    value: 'Invasive ductal carcinoma',
    sourceId: 'SRC-0412',
    sourceTitle: 'Histopathology report',
    page: 'p. 2',
    version: 'v2',
    review: 'VERIFIED',
    task: null,
    phrase: 'invasive ductal carcinoma',
    context: ['Microscopy: sections show ', ', with margins described in section 4.'],
    audit: [
      { at: '02-14 09:44', who: 'System', what: 'Extracted from SRC-0412 p.2 (v2)' },
      { at: '02-14 09:44', who: 'System', what: 'Marked SRC-0390 (v1) as superseded' },
      { at: '02-15 08:10', who: 'Dr. R. Iyer', what: 'Verified against source' },
    ],
  },
  {
    id: 'EV-1043',
    fact: 'Imaging study date',
    value: '2026-02-10 vs 2026-02-03',
    sourceId: 'SRC-0398',
    sourceTitle: 'CT chest / abdomen',
    page: 'p. 1',
    version: 'v1',
    review: 'CONFLICT',
    task: 'Confirm study date with radiology',
    phrase: 'Date of study: 10/02/2026',
    context: ['Examination: CT chest, abdomen and pelvis. ', '. Comparison: none available.'],
    audit: [
      { at: '02-11 16:07', who: 'System', what: 'Extracted from SRC-0398 p.1' },
      { at: '02-16 11:22', who: 'System', what: 'Conflict with SRC-0421 (referral quotes 03/02)' },
      { at: '02-16 11:22', who: 'System', what: 'Task created · owner: Records coordinator' },
    ],
  },
  {
    id: 'EV-1044',
    fact: 'Referral reason',
    value: 'Abnormal imaging, specialist opinion',
    sourceId: 'SRC-0421',
    sourceTitle: 'Referral letter',
    page: 'p. 1',
    version: 'v1',
    review: 'PENDING',
    task: 'Clinician to review referral reason',
    phrase: 'for specialist opinion following abnormal imaging',
    context: ['I would be grateful if you could see this patient ', '. Kind regards.'],
    audit: [
      { at: '02-16 11:21', who: 'System', what: 'Extracted from SRC-0421 p.1' },
      { at: '02-16 11:21', who: 'System', what: 'Queued for human review' },
    ],
  },
  {
    id: 'EV-1045',
    fact: 'Current medications',
    value: '4 items listed',
    sourceId: 'SRC-0377',
    sourceTitle: 'Discharge summary',
    page: 'p. 3',
    version: 'v1',
    review: 'VERIFIED',
    task: null,
    phrase: 'Medications on discharge',
    context: ['Section 5 — ', ': see list below, unchanged from admission.'],
    audit: [
      { at: '01-29 18:33', who: 'System', what: 'Extracted from SRC-0377 p.3' },
      { at: '01-30 09:02', who: 'Nurse K. Malik', what: 'Corrected one item spelling (v1 → v2)' },
      { at: '01-30 09:05', who: 'Dr. R. Iyer', what: 'Approved' },
    ],
  },
  {
    id: 'EV-1046',
    fact: 'Prior systemic therapy cycle',
    value: 'Cycle 3 recorded',
    sourceId: 'SRC-0366',
    sourceTitle: 'Chemotherapy sheet',
    page: 'p. 1',
    version: 'v3',
    review: 'VERIFIED',
    task: null,
    phrase: 'Cycle 3 — administered',
    context: ['Day unit record. ', ' per protocol sheet; observations attached.'],
    audit: [
      { at: '01-22 08:17', who: 'System', what: 'Extracted from SRC-0366 p.1 (v3)' },
      { at: '01-22 10:40', who: 'Dr. R. Iyer', what: 'Verified against source' },
    ],
  },
]
