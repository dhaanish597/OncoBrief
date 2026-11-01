import type { Category, Check, DocumentRecord, Evidence, Locale } from './domain';

export type PersonaId = 'DEMO-001' | 'DEMO-002' | 'DEMO-003';

export interface PersonaData {
  personaId: PersonaId;
  patientName: string;
  patientNameTa: string;
  mrn: string;
  dob: string;
  gender: 'female' | 'male';
  diagnosis: string;
  diagnosisTa: string;
  journeyStage: string;
  journeyStageTa: string;
  documents: DocumentRecord[];
  ledger: Evidence[];
  checks: Check[];
  missing: { id: string; text: string; note: string; source: 'patient'; status: 'missing' | 'requested' | 'available' | 'unavailable'; documentId?: string }[];
  questions: { id: string; text: string; answered: boolean; at: string }[];
}

const fixtureTime = '2026-10-28T09:00:00.000Z';

export const ONCOLOGY_PERSONAS: Record<PersonaId, PersonaData> = {
  'DEMO-001': {
    personaId: 'DEMO-001',
    patientName: 'Meenakshi Sundaram',
    patientNameTa: 'மீனாட்சி சுந்தரம்',
    mrn: 'SUN-448120',
    dob: '1974-05-12',
    gender: 'female',
    diagnosis: 'Stage IIA (cT2N0M0) Invasive Ductal Carcinoma, Left Breast',
    diagnosisTa: 'நிலை IIA ஆக்கிரமிப்பு குழாய் மார்பக புற்றுநோய் (இடது மார்பகம்)',
    journeyStage: 'AC-T Chemotherapy (Cycle 3 of 4) · Adjuvant',
    journeyStageTa: 'AC-T கீமோதெரபி (சுழற்சி 3/4) · துணை சிகிச்சை',
    documents: [
      {
        id: 'd1',
        name: 'Blood count · 14 October',
        category: 'laboratory',
        date: '2026-10-14',
        facility: 'Sunrise Diagnostic Labs',
        mimeType: 'text/plain',
        size: 310,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: true,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — Blood count report\nReport date: 14 October 2026\nLaboratory: Sunrise Diagnostic Labs\nHaemoglobin: 12.1 g/dL\nAbsolute Neutrophil Count: 2400 /uL\nPlatelets: 250,000 /uL\nReference interval supplied by this synthetic laboratory: 12.0–15.5 g/dL\nThis is fabricated training data, not a patient report.'
      },
      {
        id: 'd2',
        name: 'Oncology referral letter',
        category: 'referral',
        date: '2026-10-18',
        facility: 'Sunrise Multispeciality Hospital',
        mimeType: 'text/plain',
        size: 320,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: false,
        clinicianVerified: false,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — Referral letter\nDocument date: 18 October 2026\nAppointment: 30 October 2026 at 10:30\nBring outside histopathology blocks and referral letter.\nThis is fabricated training data, not a patient report.'
      },
      {
        id: 'd3',
        name: 'Surgical pathology report',
        category: 'pathology',
        date: '2026-10-20',
        facility: 'Sunrise Histopathology Labs',
        mimeType: 'text/plain',
        size: 384,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: true,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — Surgical Pathology Report\nPatient: Meenakshi Sundaram\nMRN: SUN-448120\nHistology: Invasive Ductal Carcinoma, Nottingham Grade 2\nReceptor Status: ER+ (90%), PR+ (80%), HER2 1+ Negative, Ki-67 22%\nMargins: Clear (>5mm). Nodes: 0/3 sentinel nodes involved.\nThis is fabricated training data, not a patient report.'
      },
      {
        id: 'd4',
        name: 'Blood count · 24 October',
        category: 'laboratory',
        date: '2026-10-24',
        facility: 'Sunrise Diagnostic Labs',
        mimeType: 'text/plain',
        size: 310,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: false,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — Blood count report\nReport date: 24 October 2026\nLaboratory: Sunrise Diagnostic Labs\nHaemoglobin: 12.4 g/dL\nAbsolute Neutrophil Count: 1800 /uL\nPlatelets: 215,000 /uL\nReference interval supplied by this synthetic laboratory: 12.0–15.5 g/dL\nThis is fabricated training data, not a patient report.'
      },
      {
        id: 'd5',
        name: 'Appointment confirmation',
        category: 'other',
        date: '2026-10-25',
        facility: 'Regional Cancer Institute',
        mimeType: 'text/plain',
        size: 290,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: false,
        clinicianVerified: false,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — Appointment confirmation\nIssued: 25 October 2026\nAppointment: 31 October 2026 at 10:30\nThis differs from the referral letter. Contact the care team to confirm.\nThis is fabricated training data, not a patient report.'
      }
    ],
    ledger: [
      {
        id: 'e-d1',
        kind: 'document',
        title: 'Blood count · 14 October',
        titleTa: 'இரத்த எண்ணிக்கை · 14 அக்டோபர்',
        date: '2026-10-14',
        status: 'clinician-confirmed',
        source: {
          documentId: 'd1',
          page: 1,
          quote: 'Haemoglobin: 12.1 g/dL',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Rao (fixture)',
          reviewedAt: fixtureTime
        }
      },
      {
        id: 'lab-d1',
        kind: 'document',
        title: 'Haemoglobin as documented: 12.1 g/dL',
        titleTa: 'அறிக்கையில் உள்ள ஹீமோகுளோபின்: 12.1 g/dL',
        date: '2026-10-14',
        status: 'clinician-confirmed',
        observation: {
          test: 'haemoglobin',
          value: 12.1,
          unit: 'g/dL',
          referenceLow: 12.0,
          referenceHigh: 15.5
        },
        source: {
          documentId: 'd1',
          page: 1,
          quote: 'Haemoglobin: 12.1 g/dL',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Rao (fixture)',
          reviewedAt: fixtureTime
        }
      },
      {
        id: 'e-d2',
        kind: 'document',
        title: 'Oncology referral letter',
        titleTa: 'புற்றுநோய் பரிந்துரைக் கடிதம்',
        date: '2026-10-18',
        status: 'extracted',
        source: {
          documentId: 'd2',
          page: 1,
          quote: 'Bring outside histopathology blocks and referral letter.',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable'
        }
      },
      {
        id: 'e-d3',
        kind: 'document',
        title: 'Surgical Pathology Report · Invasive Ductal Carcinoma',
        titleTa: 'அறுவை சிகிச்சை திசுவியல் அறிக்கை · ஆக்கிரமிப்பு குழாய் புற்றுநோய்',
        date: '2026-10-20',
        status: 'clinician-confirmed',
        source: {
          documentId: 'd3',
          page: 1,
          quote: 'Histology: Invasive Ductal Carcinoma, Nottingham Grade 2',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Rao (fixture)',
          reviewedAt: fixtureTime
        }
      },
      {
        id: 'e-d4',
        kind: 'document',
        title: 'Blood count · 24 October',
        titleTa: 'இரத்த எண்ணிக்கை · 24 அக்டோபர்',
        date: '2026-10-24',
        status: 'clinician-confirmed',
        source: {
          documentId: 'd4',
          page: 1,
          quote: 'Haemoglobin: 12.4 g/dL',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Rao (fixture)',
          reviewedAt: fixtureTime
        }
      },
      {
        id: 'lab-d4',
        kind: 'document',
        title: 'Haemoglobin as documented: 12.4 g/dL',
        titleTa: 'அறிக்கையில் உள்ள ஹீமோகுளோபின்: 12.4 g/dL',
        date: '2026-10-24',
        status: 'clinician-confirmed',
        observation: {
          test: 'haemoglobin',
          value: 12.4,
          unit: 'g/dL',
          referenceLow: 12.0,
          referenceHigh: 15.5
        },
        source: {
          documentId: 'd4',
          page: 1,
          quote: 'Haemoglobin: 12.4 g/dL',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Rao (fixture)',
          reviewedAt: fixtureTime
        }
      },
      {
        id: 'a1',
        kind: 'appointment',
        title: 'Appointment date from referral letter: 30 October 2026',
        titleTa: 'பரிந்துரைக் கடிதத்தின் சந்திப்பு தேதி: 30 அக்டோபர் 2026',
        date: '2026-10-30',
        status: 'conflicting',
        source: {
          documentId: 'd2',
          page: 1,
          quote: 'Appointment: 30 October 2026 at 10:30',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable'
        }
      },
      {
        id: 'a2',
        kind: 'appointment',
        title: 'Appointment date from confirmation: 31 October 2026',
        titleTa: 'மருத்துவமனை உறுதிப்படுத்தல் தேதி: 31 அக்டோபர் 2026',
        date: '2026-10-31',
        status: 'conflicting',
        source: {
          documentId: 'd5',
          page: 1,
          quote: 'Appointment: 31 October 2026 at 10:30',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable'
        }
      }
    ],
    checks: [
      { id: 'c1', label: 'Review pathology and staging reports', labelTa: 'திசுப் பரிசோதனை அறிக்கைகளைப் பார்க்கவும்', done: false, enabled: true, optional: false },
      { id: 'c2', label: 'Prepare chemotherapy questions for oncologist', labelTa: 'மருத்துவரிடம் கேட்க வேண்டிய கேள்விகளைத் தயாரிக்கவும்', done: true, enabled: true, optional: false },
      { id: 'c3', label: 'Confirm consultation appointment date (conflicting dates)', labelTa: 'முரண்பட்ட சந்திப்பு தேதியை உறுதிப்படுத்தவும்', done: false, enabled: true, optional: false },
      { id: 'c4', label: 'Add personal preparation notes', labelTa: 'தனிப்பட்ட குறிப்புகளைச் சேர்க்கவும்', done: false, enabled: true, optional: true },
    ],
    missing: [
      { id: 'm1', text: 'Outside IHC paraffin block review', note: 'Requested by Medical Oncology before Cycle 4.', source: 'patient', status: 'missing' }
    ],
    questions: [
      { id: 'q1', text: 'What precautions should I take if my temperature reaches 100.4°F during AC-T?', answered: false, at: fixtureTime }
    ]
  },

  'DEMO-002': {
    personaId: 'DEMO-002',
    patientName: 'Rajeshwari Nair',
    patientNameTa: 'ராஜேஸ்வரி நாயர்',
    mrn: 'NAI-882104',
    dob: '1968-11-20',
    gender: 'female',
    diagnosis: 'Stage IIIB High-Grade Serous Ovarian Carcinoma',
    diagnosisTa: 'நிலை IIIB உயர் நிலை சீரியஸ் கருப்பை புற்றுநோய்',
    journeyStage: 'Interval Debulking Evaluation',
    journeyStageTa: 'இடைக்கால அறுவை சிகிச்சை மதிப்பீடு',
    documents: [
      {
        id: 'doc-002-lab',
        name: 'Serum CA-125 Tumor Marker Report',
        category: 'laboratory',
        date: '2025-05-15',
        facility: 'Meridian Clinical Laboratories',
        mimeType: 'text/plain',
        size: 280,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: true,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — CA-125 Tumor Marker\nPatient: Rajeshwari Nair\nCA-125: 42.0 U/mL\nReference interval supplied by this synthetic laboratory: 0.0–35.0 U/mL\nPost-chemo response assessment.'
      },
      {
        id: 'doc-002-img',
        name: 'Contrast CT Abdomen & Pelvis',
        category: 'imaging',
        date: '2025-05-18',
        facility: 'City Imaging Centre',
        mimeType: 'text/plain',
        size: 320,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: false,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — CT Abdomen and Pelvis\nReport date: 2025-05-18\nInterval partial regression of peritoneal deposits noted. Debulking feasibility discussed.'
      }
    ],
    ledger: [
      {
        id: 'e-002-img',
        kind: 'document',
        title: 'CT Abdomen & Pelvis · Interval response',
        titleTa: 'சிடி ஸ்கேன் வயிறு மற்றும் இடுப்பு · இடைக்கால முடிவு',
        date: '2025-05-18',
        status: 'clinician-confirmed',
        source: {
          documentId: 'doc-002-img',
          page: 1,
          quote: 'Interval partial regression of peritoneal deposits noted.',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Ananya (fixture)',
          reviewedAt: fixtureTime
        }
      }
    ],
    checks: [
      { id: 'c1', label: 'Review CA-125 trend and CT findings', labelTa: 'CA-125 மற்றும் சிடி ஸ்கேன் முடிவுகளைப் பார்க்கவும்', done: true, enabled: true, optional: false },
      { id: 'c2', label: 'Prepare surgery discussion questions', labelTa: 'அறுவை சிகிச்சை பற்றிய கேள்விகளைத் தயாரிக்கவும்', done: false, enabled: true, optional: false },
    ],
    missing: [
      { id: 'm1', text: 'BRCA1/2 genetic test documentation', note: 'Family history counseling record copy.', source: 'patient', status: 'missing' }
    ],
    questions: [
      { id: 'q1', text: 'What is the anticipated hospital stay after interval debulking surgery?', answered: false, at: fixtureTime }
    ]
  },

  'DEMO-003': {
    personaId: 'DEMO-003',
    patientName: 'Arjun Kulkarni',
    patientNameTa: 'அர்ஜுன் குல்கர்னி',
    mrn: 'READY-1001',
    dob: '1961-08-04',
    gender: 'male',
    diagnosis: 'Stage IIIB (pT3N1bM0) Sigmoid Colon Adenocarcinoma',
    diagnosisTa: 'நிலை IIIB சிக்மாய்டு பெருங்குடல் புற்றுநோய்',
    journeyStage: 'Adjuvant FOLFOX (Cycle 8 of 12) · Surveillance',
    journeyStageTa: 'துணை FOLFOX கீமோதெரபி (சுழற்சி 8/12)',
    documents: [
      {
        id: 'doc-003-lab',
        name: 'Serum CEA & Blood Count Report',
        category: 'laboratory',
        date: '2025-04-20',
        facility: 'Meridian Diagnostics Laboratory',
        mimeType: 'text/plain',
        size: 260,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: true,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — CEA & Blood Count\nPatient: Arjun Kulkarni\nCEA: 2.1 ng/mL\nHaemoglobin: 12.8 g/dL\nReference interval supplied by this synthetic laboratory: 0.0–3.0 ng/mL'
      },
      {
        id: 'doc-003-rx',
        name: 'Prescription & FOLFOX Administration',
        category: 'prescription',
        date: '2025-04-23',
        facility: 'Regional Cancer Institute',
        mimeType: 'text/plain',
        size: 240,
        version: 'fixture-v1',
        extraction: 'fixture',
        patientReviewed: true,
        clinicianVerified: true,
        addedAt: fixtureTime,
        originalText: 'SYNTHETIC SAMPLE — Prescription copy\nDate: 23 April 2025\nFOLFOX Cycle 8 completed. Antiemetic support prescribed.'
      }
    ],
    ledger: [
      {
        id: 'e-003-rx',
        kind: 'document',
        title: 'Prescription & Administration Record · Cycle 8',
        titleTa: 'மருந்துச் சீட்டு மற்றும் சுழற்சி 8 பதிவு',
        date: '2025-04-23',
        status: 'clinician-confirmed',
        source: {
          documentId: 'doc-003-rx',
          page: 1,
          quote: 'FOLFOX Cycle 8 completed. Antiemetic support prescribed.',
          version: 'fixture-v1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
          reviewer: 'Dr. Rao (fixture)',
          reviewedAt: fixtureTime
        }
      }
    ],
    checks: [
      { id: 'c1', label: 'Review CEA tumor marker result', labelTa: 'CEA பரிசோதனை முடிவைப் பார்க்கவும்', done: true, enabled: true, optional: false },
      { id: 'c2', label: 'Confirm cycle 9 infusion appointment', labelTa: 'சுழற்சி 9 சந்திப்பை உறுதிப்படுத்தவும்', done: true, enabled: true, optional: false },
    ],
    missing: [],
    questions: [
      { id: 'q1', text: 'How should I manage cold sensitivity in fingers after oxaliplatin?', answered: false, at: fixtureTime }
    ]
  }
};
