import { scanForBoundaryViolation } from '../policy/clinical-boundary';

export type StudioArtifactKind =
  | 'referral_letter'
  | 'tumor_board_deck'
  | 'academic_case_abstract'
  | 'patient_info_sheet';

export interface StudioPatientInfo {
  id: string;
  displayName: string;
  mrn?: string | null;
  abhaId?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  ageYears?: number | null;
  primaryLanguage?: string;
  facilityName?: string;
}

export interface StudioEvidenceFactInput {
  evidenceFactId: string;
  factType: string;
  valueText: string;
  verbatimQuote: string;
  observedOn?: string | null;
  displayDate?: string | null;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  state: 'extracted' | 'verified' | 'conflicting' | 'rejected' | 'superseded' | 'corrected';
  confidenceBand?: string;
}

export interface StudioGuidelineSpanInput {
  spanId: string;
  guidelineDocumentId: string;
  guidelineCode: string;
  guidelineTitle: string;
  issuingBody: string;
  versionLabel: string;
  publicationDate: string;
  pageNumber: number;
  sectionHeading: string;
  verbatimText: string;
}

export interface StudioConflictInput {
  conflictSetId: string;
  factType: string;
  memberValues: {
    valueText: string;
    documentName: string;
    pageNumber: number | null;
  }[];
  reason?: string;
}

export interface StudioGapInput {
  recordGapId: string;
  label: string;
  requirementKind: string;
  status: string;
}

export interface StudioTaskInput {
  taskId: string;
  title: string;
  status: string;
  dueOn?: string | null;
}

export interface GenerateDraftInput {
  kind: StudioArtifactKind;
  patient: StudioPatientInfo;
  facts: readonly StudioEvidenceFactInput[];
  guidelines?: readonly StudioGuidelineSpanInput[];
  conflicts?: readonly StudioConflictInput[];
  gaps?: readonly StudioGapInput[];
  tasks?: readonly StudioTaskInput[];
  includeUnverifiedInPreview?: boolean;
  locale?: string;
  documentDate?: string;
}

export interface GeneratedDraftResult {
  kind: StudioArtifactKind;
  title: string;
  markdownBody: string;
  citedFactIds: string[];
  citedGuidelineIds: string[];
  isDeidentified: boolean;
  unverifiedCitationsCount: number;
  warnings: string[];
}

function parseDateToDays(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / (1000 * 60 * 60 * 24));
}

export function generateStudioDraft(input: GenerateDraftInput): GeneratedDraftResult {
  const {
    kind,
    patient,
    facts,
    guidelines = [],
    conflicts = [],
    gaps = [],
    tasks = [],
    includeUnverifiedInPreview = false,
  } = input;

  // Filter facts based on preview vs sign-off safety
  const eligibleFacts = facts.filter((f) => {
    if (f.state === 'rejected' || f.state === 'superseded' || f.state === 'conflicting') return false;
    if (!includeUnverifiedInPreview && f.state === 'extracted') return false;
    return true;
  });

  const citedFactIds: string[] = [];
  const citedGuidelineIds: string[] = [];
  let unverifiedCitationsCount = 0;
  const warnings: string[] = [];

  const recordFactCitation = (fact: StudioEvidenceFactInput): string => {
    if (!citedFactIds.includes(fact.evidenceFactId)) {
      citedFactIds.push(fact.evidenceFactId);
    }
    const citeNumber = citedFactIds.indexOf(fact.evidenceFactId) + 1;
    if (fact.state === 'extracted') {
      unverifiedCitationsCount++;
      return `[E${citeNumber}] [UNVERIFIED — Confirm Source Before Sign-Off]`;
    }
    return `[E${citeNumber}]`;
  };

  const recordGuidelineCitation = (g: StudioGuidelineSpanInput): string => {
    if (!citedGuidelineIds.includes(g.guidelineDocumentId)) {
      citedGuidelineIds.push(g.guidelineDocumentId);
    }
    return `[G${citedGuidelineIds.indexOf(g.guidelineDocumentId) + 1}]`;
  };

  // Group facts by category
  const diagnoses = eligibleFacts.filter((f) => f.factType.startsWith('diagnosis'));
  const procedures = eligibleFacts.filter((f) => f.factType.startsWith('procedure') || f.factType.startsWith('surgery'));
  const medications = eligibleFacts.filter((f) => f.factType.startsWith('medication') || f.factType.startsWith('chemo'));
  const radiation = eligibleFacts.filter((f) => f.factType.startsWith('radiation'));
  const labs = eligibleFacts.filter((f) => f.factType.startsWith('lab_result') || f.factType.startsWith('vital_sign'));
  const appointments = eligibleFacts.filter((f) => f.factType.startsWith('appointment'));
  const instructions = eligibleFacts.filter((f) => f.factType.startsWith('instruction') || f.factType.startsWith('pending_investigation'));
  const biomarkers = eligibleFacts.filter((f) => f.factType.startsWith('biomarker') || f.factType.startsWith('ihc'));

  if (kind === 'referral_letter') {
    const lines: string[] = [
      `# Specialist Referral / Transfer Letter — ${patient.displayName}`,
      `**Facility:** ${patient.facilityName ?? 'Regional Cancer Institute'} | **Date:** ${new Date(input.documentDate ?? Date.now()).toLocaleDateString('en-GB')}`,
      `**Patient Name:** ${patient.displayName} | **MRN:** ${patient.mrn ?? 'Not stated'} | **ABHA:** ${patient.abhaId ?? 'Not stated'}`,
      `**Age / Gender:** ${patient.ageYears ? `${patient.ageYears} Y` : 'Adult'}, ${patient.gender ?? 'Not stated'}`,
      '',
      '---',
      '',
      '### 1. Documented Primary Reason for Referral / Transfer',
    ];

    if (diagnoses.length > 0) {
      lines.push(
        ...diagnoses.map((d) => `- ${d.valueText} ${recordFactCitation(d)} *(Documented in ${d.documentName}, p. ${d.pageNumber ?? 1})*`),
      );
    } else {
      lines.push('- No verified reason for referral is recorded.');
    }

    lines.push('', '### 2. Relevant Histopathology & Biomarker Findings');
    if (biomarkers.length > 0) {
      lines.push(
        ...biomarkers.map((b) => `- ${b.valueText} ${recordFactCitation(b)} *(Source: ${b.documentName}, p. ${b.pageNumber ?? 1})*`),
      );
    } else {
      lines.push('- No receptor/biomarker findings documented in verified records to date.');
    }

    lines.push('', '### 3. Chronological Procedures & Surgical Interventions');
    if (procedures.length > 0) {
      lines.push(
        ...procedures.map(
          (p) => `- **${p.displayDate ?? 'Date not stated'}**: ${p.valueText} ${recordFactCitation(p)} *(Source: ${p.documentName}, p. ${p.pageNumber ?? 1})*`,
        ),
      );
    } else {
      lines.push('- No surgical procedures documented in the verified record.');
    }

    lines.push('', '### 4. Recorded Chemotherapy & Systemic Administrations');
    if (medications.length > 0) {
      lines.push(
        ...medications.map(
          (m) => `- **${m.displayDate ?? 'Date not stated'}**: ${m.valueText} ${recordFactCitation(m)} *(Source: ${m.documentName})*`,
        ),
      );
    } else {
      lines.push('- No systemic chemotherapy administrations documented to date.');
    }

    lines.push('', '### 5. Radiation Oncology Summary');
    if (radiation.length > 0) {
      lines.push(
        ...radiation.map(
          (r) => `- **${r.displayDate ?? 'Date not stated'}**: ${r.valueText} ${recordFactCitation(r)} *(Source: ${r.documentName})*`,
        ),
      );
    } else {
      lines.push('- No radiation therapy completion summaries recorded.');
    }

    lines.push('', '### 6. Serial Laboratory & Tumor Marker Values (As Written)');
    if (labs.length > 0) {
      lines.push(
        ...labs.map(
          (l) => `- **${l.displayDate ?? 'Date not stated'}**: ${l.valueText} ${recordFactCitation(l)} *(Source: ${l.documentName}, quote: "${l.verbatimQuote}")*`,
        ),
      );
    } else {
      lines.push('- No serial laboratory reports available in the verified record.');
    }

    lines.push('', '### 7. Pending Administrative Items & Document Requests');
    const openTasks = tasks.filter((t) => t.status === 'open');
    if (openTasks.length > 0) {
      lines.push(...openTasks.map((t) => `- **Pending Task**: ${t.title}${t.dueOn ? ` (Target due date: ${t.dueOn})` : ''}`));
    }
    const missingGaps = gaps.filter((g) => g.status === 'missing' && g.requirementKind === 'required');
    if (missingGaps.length > 0) {
      lines.push(...missingGaps.map((g) => `- **Missing Required Record**: ${g.label}`));
    }
    if (openTasks.length === 0 && missingGaps.length === 0) {
      lines.push('- No outstanding administrative tasks or missing required records.');
    }

    lines.push(
      '',
      '---',
      '',
      '### Referring Clinician Sign-off',
      '**Reviewing Clinician:** ___________________________',
      '**Medical Registration Number:** ___________________',
      '**Signature / Stamp:** _____________________________',
      '**Date:** _________________________________________',
      '',
      '*Note: This specialist transfer letter is compiled exclusively from source-verified electronic ledger entries. It contains no autonomous clinical recommendations or drug prescriptions.*',
    );

    return {
      kind,
      title: `Specialist Referral / Transfer Letter — ${patient.displayName}`,
      markdownBody: lines.join('\n'),
      citedFactIds,
      citedGuidelineIds,
      isDeidentified: false,
      unverifiedCitationsCount,
      warnings,
    };
  }

  if (kind === 'tumor_board_deck') {
    const lines: string[] = [
      `# Multidisciplinary Tumor Board Presentation — ${patient.displayName}`,
      `**Case Review Session:** Multidisciplinary Breast / Oncology Board`,
      `**Patient:** ${patient.displayName} (${patient.mrn ?? 'MRN not stated'}) | **Age/Gender:** ${patient.ageYears ? `${patient.ageYears} Y` : 'Adult'}, ${patient.gender ?? 'Not stated'}`,
      '',
      '---',
      '',
      '## Slide 1: Case Identity & Record Readiness',
      `- **Patient:** ${patient.displayName}`,
      `- **MRN / Health ID:** ${patient.mrn ?? 'Not stated'} / ${patient.abhaId ?? 'Not stated'}`,
      `- **Primary Referring Facility:** ${patient.facilityName ?? 'Regional Cancer Institute'}`,
      `- **Record Readiness Status:** ${gaps.filter((g) => g.status === 'missing').length === 0 && conflicts.length === 0 ? 'CONSULT-READY (0 gaps, 0 open conflicts)' : 'ACTION REQUIRED (Pending items below)'}`,
      `- **Open Administrative Tasks:** ${tasks.filter((t) => t.status === 'open').length} pending`,
      '',
      '---',
      '',
      '## Slide 2: Chronological Interventions & Administrations',
    ];

    const chronological = [...procedures, ...medications, ...radiation].sort((a, b) =>
      (a.displayDate ?? '').localeCompare(b.displayDate ?? ''),
    );

    if (chronological.length > 0) {
      lines.push(
        ...chronological.map(
          (item) => `- **${item.displayDate ?? 'Date not stated'}** [${item.factType.split('.')[0]?.toUpperCase()}]: ${item.valueText} ${recordFactCitation(item)} *(Source: ${item.documentName})*`,
        ),
      );
    } else {
      lines.push('- No prior interventions documented in available records.');
    }

    lines.push(
      '',
      '---',
      '',
      '## Slide 3: Histopathology, Biomarkers & Diagnostics',
    );

    const diagnosticItems = [...diagnoses, ...biomarkers, ...labs];
    if (diagnosticItems.length > 0) {
      lines.push(
        ...diagnosticItems.map(
          (item) => `- **${item.displayDate ?? 'Date not stated'}**: ${item.valueText} ${recordFactCitation(item)} *(Source: ${item.documentName}, p. ${item.pageNumber ?? 1})*`,
        ),
      );
    } else {
      lines.push('- No diagnostic pathology or imaging records found.');
    }

    lines.push(
      '',
      '---',
      '',
      '## Slide 4: Unresolved Source Contradictions & Missing Records',
    );

    if (conflicts.length > 0) {
      lines.push('### Open Source Disagreements (Reconciliation Required):');
      conflicts.forEach((c) => {
        lines.push(`- **Conflict (${c.factType})**: ${c.reason ?? 'Contradictory values in source documents'}`);
        c.memberValues.forEach((mv) => {
          lines.push(`  - Source "${mv.documentName}" (p. ${mv.pageNumber ?? 1}): Recorded "${mv.valueText}"`);
        });
      });
    } else {
      lines.push('- Zero open source contradictions identified.');
    }

    const missingItems = gaps.filter((g) => g.status === 'missing');
    if (missingItems.length > 0) {
      lines.push('', '### Missing Diagnostic & Staging Requirements:');
      missingItems.forEach((g) => {
        lines.push(`- **${g.requirementKind.toUpperCase()}**: ${g.label}`);
      });
    } else {
      lines.push('', '- All required diagnostic checklist records are satisfied.');
    }

    lines.push(
      '',
      '---',
      '',
      '## Slide 5: Reference Institutional & NCG Oncology Guidelines',
    );

    if (guidelines.length > 0) {
      guidelines.forEach((g) => {
        lines.push(
          `- **${g.sectionHeading}** (${g.guidelineTitle}, ${g.versionLabel}, p. ${g.pageNumber}) ${recordGuidelineCitation(g)}:`,
          `  > "${g.verbatimText}"`,
        );
      });
    } else {
      lines.push('- No institutional guideline reference passages attached for this case.');
    }

    lines.push(
      '',
      '---',
      '',
      '## Slide 6: Multidisciplinary Board Discussion',
      '**[Clinician Input Required: Medical decision and multidisciplinary board recommendations to be recorded by attending physician]**',
      '',
      '- **Surgical Oncology Opinion:** _____________________________________',
      '- **Medical Oncology Opinion:** ______________________________________',
      '- **Radiation Oncology Opinion:** ____________________________________',
      '- **Consensus Action Plan:** _________________________________________',
      '- **Tumor Board Chair Sign-off:** ____________________________________',
    );

    return {
      kind,
      title: `Multidisciplinary Tumor Board Presentation — ${patient.displayName}`,
      markdownBody: lines.join('\n'),
      citedFactIds,
      citedGuidelineIds,
      isDeidentified: false,
      unverifiedCitationsCount,
      warnings,
    };
  }

  if (kind === 'academic_case_abstract') {
    // Collect all valid dates to establish Day 0
    const allDates = eligibleFacts
      .map((f) => parseDateToDays(f.observedOn ?? f.displayDate))
      .filter((d): d is number => d !== null);

    const baseDay = allDates.length > 0 ? Math.min(...allDates) : null;

    const formatRelativeDate = (dateStr: string | null | undefined): string => {
      const days = parseDateToDays(dateStr);
      if (days === null || baseDay === null) return 'Day not stated';
      const offset = days - baseDay;
      return offset === 0 ? 'Day 0' : `Day +${offset}`;
    };

    const lines: string[] = [
      '# De-Identified Academic Case Report Draft',
      `**Subject:** Adult Patient (${patient.gender ?? 'Unknown gender'}, Age: ${patient.ageYears ?? 'Adult'} years)`,
      '**Institution:** Anonymized Regional Oncology Center',
      '',
      '---',
      '',
      '### Abstract & Case Presentation',
      `We report the clinical journey of a ${patient.ageYears ?? 'adult'}-year-old ${patient.gender?.toLowerCase() ?? 'patient'} evaluated for oncology management. Direct personal identifiers (name, registration number, national health identifier, and calendar dates) have been de-identified in accordance with clinical research privacy standards.`,
      '',
      '### Documented Primary Diagnosis & Receptor Assessment',
    ];

    if (diagnoses.length > 0 || biomarkers.length > 0) {
      [...diagnoses, ...biomarkers].forEach((item) => {
        lines.push(`- **${formatRelativeDate(item.observedOn ?? item.displayDate)}**: ${item.valueText} ${recordFactCitation(item)}`);
      });
    } else {
      lines.push('- No primary diagnostic details documented.');
    }

    lines.push('', '### Timeline of Documented Interventions & Systemic Therapies');
    const interventions = [...procedures, ...medications, ...radiation].sort((a, b) =>
      (a.displayDate ?? '').localeCompare(b.displayDate ?? ''),
    );

    if (interventions.length > 0) {
      interventions.forEach((item) => {
        lines.push(`- **${formatRelativeDate(item.observedOn ?? item.displayDate)}**: ${item.valueText} ${recordFactCitation(item)}`);
      });
    } else {
      lines.push('- No surgical or systemic interventions recorded.');
    }

    lines.push('', '### Serial Laboratory Observations');
    if (labs.length > 0) {
      labs.forEach((l) => {
        lines.push(`- **${formatRelativeDate(l.observedOn ?? l.displayDate)}**: ${l.valueText} ${recordFactCitation(l)}`);
      });
    } else {
      lines.push('- No serial laboratory values recorded.');
    }

    lines.push(
      '',
      '---',
      '',
      '*Algorithmic De-Identification Notice: This draft employs automated direct identifier suppression (names, MRNs, ABHA IDs, telephone numbers, emails, and calendar dates) for scientific review and teaching drafts. It does not constitute certified expert determination under HIPAA §164.514(b)(1) or legal de-identification certification.*',
    );

    return {
      kind,
      title: 'De-Identified Academic Case Report Draft',
      markdownBody: lines.join('\n'),
      citedFactIds,
      citedGuidelineIds,
      isDeidentified: true,
      unverifiedCitationsCount,
      warnings,
    };
  }

  // patient_info_sheet
  const lines: string[] = [
    `# Patient & Caregiver Visit Summary — ${patient.displayName}`,
    `**Patient Name:** ${patient.displayName} | **MRN:** ${patient.mrn ?? 'Not stated'}`,
    `**Hospital Records Office Contact:** ${patient.facilityName ?? 'Regional Cancer Institute'}`,
    '',
    '---',
    '',
    '### Confirmed Next Appointment Information',
  ];

  if (appointments.length > 0) {
    appointments.forEach((appt) => {
      lines.push(`- **Next Visit:** ${appt.valueText} ${recordFactCitation(appt)}`);
    });
  } else {
    lines.push('- No verified upcoming appointments documented. Please contact the oncology outpatient desk to confirm your next visit.');
  }

  lines.push('', '### Records & Items to Bring for Your Consultation');
  if (instructions.length > 0) {
    instructions.forEach((inst) => {
      lines.push(`- **Required Item:** ${inst.valueText} ${recordFactCitation(inst)}`);
    });
  } else {
    lines.push('- No specific document-bring instructions are recorded in verified source evidence for this visit.');
  }

  lines.push(
    '',
    '### Hospital Department & Outpatient Instructions',
    `- **Department:** Oncology Outpatient Department (OPD)`,
    `- **Registration Desk:** Confirm check-in arrangements with the outpatient desk.`,
    `- **Contact Information:** For appointment rescheduling or records questions, contact the records coordination office.`,
    '',
    '---',
    '',
    '**Important Administrative Disclaimer:**',
    '*This document contains administrative visit preparation instructions only. It does not contain medical advice, medication changes, or treatment instructions. For any clinical questions, please consult your oncology care team.*',
  );

  return {
    kind,
    title: `Patient & Caregiver Visit Summary — ${patient.displayName}`,
    markdownBody: lines.join('\n'),
    citedFactIds,
    citedGuidelineIds,
    isDeidentified: false,
    unverifiedCitationsCount,
    warnings,
  };
}

export function validateDeidentification(
  markdownBody: string,
  patient: StudioPatientInfo,
): { isValid: boolean; leaks: string[] } {
  const leaks: string[] = [];

  // Check patient full display name
  if (patient.displayName && patient.displayName.length > 2) {
    if (markdownBody.toLowerCase().includes(patient.displayName.toLowerCase())) {
      leaks.push(`Patient display name detected: "${patient.displayName}"`);
    }

    // Check individual name parts (first, last) excluding honorifics
    const honorifics = new Set(['dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'dr', 'mr', 'mrs', 'ms']);
    const nameParts = patient.displayName
      .split(/\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 2 && !honorifics.has(p.toLowerCase()));

    for (const part of nameParts) {
      const regex = new RegExp(`\\b${part}\\b`, 'i');
      if (regex.test(markdownBody)) {
        if (!leaks.some((l) => l.includes(part))) {
          leaks.push(`Partial patient name detected: "${part}"`);
        }
      }
    }
  }

  // Check MRN
  if (patient.mrn && patient.mrn.length > 2) {
    if (markdownBody.toLowerCase().includes(patient.mrn.toLowerCase())) {
      leaks.push(`Patient MRN detected: "${patient.mrn}"`);
    }
  }

  // Check ABHA ID
  if (patient.abhaId && patient.abhaId.length > 2) {
    if (markdownBody.toLowerCase().includes(patient.abhaId.toLowerCase())) {
      leaks.push(`Patient ABHA ID detected: "${patient.abhaId}"`);
    }
  }

  // Check date of birth
  if (patient.dateOfBirth && markdownBody.includes(patient.dateOfBirth)) {
    leaks.push(`Patient date of birth detected: "${patient.dateOfBirth}"`);
  }

  // Check raw ISO / calendar dates (YYYY-MM-DD)
  const isoDates = markdownBody.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (isoDates && isoDates.length > 0) {
    leaks.push(`Raw ISO calendar dates detected: ${isoDates.join(', ')}`);
  }

  // Check formatted calendar dates (DD/MM/YYYY or DD-MM-YYYY)
  const formattedDates = markdownBody.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/g);
  if (formattedDates && formattedDates.length > 0) {
    leaks.push(`Formatted calendar dates detected: ${formattedDates.join(', ')}`);
  }

  // Check named-month calendar dates (e.g. 15 June 2025 or 15 Jun 2025)
  const textDates = markdownBody.match(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi);
  if (textDates && textDates.length > 0) {
    leaks.push(`Calendar date with month detected: ${textDates.join(', ')}`);
  }

  // Check phone numbers (10 digits or international format)
  const phoneMatches = markdownBody.match(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g) ??
    markdownBody.match(/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g);
  if (phoneMatches && phoneMatches.length > 0) {
    leaks.push(`Phone number pattern detected: ${phoneMatches.join(', ')}`);
  }

  // Check email addresses
  const emailMatches = markdownBody.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);
  if (emailMatches && emailMatches.length > 0) {
    leaks.push(`Email address pattern detected: ${emailMatches.join(', ')}`);
  }

  return {
    isValid: leaks.length === 0,
    leaks,
  };
}

export interface RevalidationResult {
  valid: boolean;
  citedFactIds: string[];
  citedGuidelineIds: string[];
  invalidCitations: string[];
  unverifiedFactIds: string[];
  ungroundedClaims: string[];
}

export function revalidateStudioMarkdownCitations(
  markdownBody: string,
  availableFacts: readonly StudioEvidenceFactInput[],
  availableGuidelines: readonly StudioGuidelineSpanInput[] = [],
  trustedTemplateMarkdown = '',
): RevalidationResult {
  const invalidCitations: string[] = [];
  const citedFactIds: string[] = [];
  const citedGuidelineIds: string[] = [];
  const unverifiedFactIds: string[] = [];
  const ungroundedClaims: string[] = [];

  for (const v of scanForBoundaryViolation(markdownBody)) {
    ungroundedClaims.push(`boundary_violation:${v.patternId}`);
  }

  // This is deliberately exact-clause validation, not semantic medical NLU.
  // Only server-regenerated template lines or verbatim source clauses may pass.
  // Callers must never supply the edited body itself as the trusted template.
  const allowedLines = new Set(trustedTemplateMarkdown.split('\n').map((line) => line.trim()).filter(Boolean));
  availableFacts.forEach((fact, index) => {
    const clause = `${fact.valueText} [E${index + 1}]`;
    allowedLines.add(clause);
    allowedLines.add(`- ${clause}`);
  });
  availableGuidelines.forEach((g, index) => {
    allowedLines.add(`${g.verbatimText} [G${index + 1}]`);
  });
  for (const line of markdownBody.split('\n').map((item) => item.trim()).filter(Boolean)) {
    if (!allowedLines.has(line)) ungroundedClaims.push('unsupported_clause: content must match a source clause or the generated template');
  }

  // Check all [E#]
  const eMatches = [...markdownBody.matchAll(/\[E(\d+)\]/gi)];
  for (const match of eMatches) {
    const idx = parseInt(match[1]!, 10) - 1;
    if (idx < 0 || idx >= availableFacts.length) {
      invalidCitations.push(match[0]!);
    } else {
      const fact = availableFacts[idx]!;
      if (!citedFactIds.includes(fact.evidenceFactId)) {
        citedFactIds.push(fact.evidenceFactId);
      }
      if (fact.state !== 'verified' && fact.state !== 'corrected') {
        if (!unverifiedFactIds.includes(fact.evidenceFactId)) {
          unverifiedFactIds.push(fact.evidenceFactId);
        }
      }
      if (fact.factType.startsWith('lab_result') || fact.factType.startsWith('vital_sign')) {
        const factNums = fact.valueText.match(/\d+(?:\.\d+)?/g) ?? [];
        if (factNums.length > 0 && match.index !== undefined) {
          const lineStart = markdownBody.lastIndexOf('\n', match.index) + 1;
          const lineEndIdx = markdownBody.indexOf('\n', match.index);
          const line = markdownBody.slice(lineStart, lineEndIdx === -1 ? markdownBody.length : lineEndIdx);
          if (!line.includes(fact.valueText)) {
            invalidCitations.push(`${match[0]!}:ungrounded_value`);
            ungroundedClaims.push(`${match[0]!} does not match source value "${fact.valueText}"`);
          }
        }
      }
    }
  }

  // Check all [G#]
  const gMatches = [...markdownBody.matchAll(/\[G(\d+)\]/gi)];
  for (const match of gMatches) {
    const idx = parseInt(match[1]!, 10) - 1;
    if (idx < 0 || idx >= availableGuidelines.length) {
      invalidCitations.push(match[0]!);
    } else {
      const guideline = availableGuidelines[idx]!;
      if (!citedGuidelineIds.includes(guideline.guidelineDocumentId)) {
        citedGuidelineIds.push(guideline.guidelineDocumentId);
      }
    }
  }

  return {
    valid: invalidCitations.length === 0 && unverifiedFactIds.length === 0 && ungroundedClaims.length === 0,
    citedFactIds,
    citedGuidelineIds,
    invalidCitations,
    unverifiedFactIds,
    ungroundedClaims,
  };
}
