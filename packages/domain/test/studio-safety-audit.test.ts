import { describe, expect, it } from 'vitest';
import {
  generateStudioDraft,
  revalidateStudioMarkdownCitations,
  validateDeidentification,
  type StudioPatientInfo,
  type StudioEvidenceFactInput,
} from '../src/studio/draft-generator';

const mockPatient: StudioPatientInfo = {
  id: '00000000-0000-0000-0000-000000000001',
  displayName: 'Ananya Sharma',
  mrn: 'MRN-987654',
  abhaId: '91-1234-5678-9012',
  gender: 'Female',
  dateOfBirth: '1978-05-12',
  ageYears: 47,
  facilityName: 'Regional Cancer Institute',
};

const mockFacts: StudioEvidenceFactInput[] = [
  {
    evidenceFactId: 'f1',
    factType: 'diagnosis.recorded',
    valueText: 'Infiltrating ductal carcinoma of right breast',
    verbatimQuote: 'Infiltrating duct carcinoma, grade 2',
    observedOn: '2025-06-01',
    displayDate: '01 Jun 2025',
    documentId: 'doc1',
    documentName: 'histopathology-report.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'f2',
    factType: 'procedure.recorded',
    valueText: 'Modified radical mastectomy right breast',
    verbatimQuote: 'Patient underwent right MRM with axillary clearance',
    observedOn: '2025-06-15',
    displayDate: '15 Jun 2025',
    documentId: 'doc2',
    documentName: 'operative-note.pdf',
    pageNumber: 1,
    state: 'verified',
  },
  {
    evidenceFactId: 'f3',
    factType: 'lab_result.as_written',
    valueText: 'Hemoglobin: 10.8 g/dL',
    verbatimQuote: 'Haemoglobin: 10.8 g/dL',
    observedOn: '2025-06-20',
    displayDate: '20 Jun 2025',
    documentId: 'doc3',
    documentName: 'cbc-report.pdf',
    pageNumber: 1,
    state: 'verified',
  },
];

describe('Phase 4 Safety Audit: Studio De-Identification and Clinical Boundary Defenses', () => {
  it('detects and flags partial patient names in de-identified drafts', () => {
    const textWithPartial = 'Case Discussion: Patient Sharma was evaluated on Day 0.';
    const result = validateDeidentification(textWithPartial, mockPatient);
    expect(result.isValid).toBe(false);
    expect(result.leaks.some((l) => l.includes('Sharma'))).toBe(true);
  });

  it('detects and flags 10-digit phone numbers and international phone numbers', () => {
    const textWithPhone = 'Contact caregiver directly at +91 9876543210 for scheduling.';
    const result = validateDeidentification(textWithPhone, mockPatient);
    expect(result.isValid).toBe(false);
    expect(result.leaks.some((l) => l.includes('Phone number'))).toBe(true);
  });

  it('detects and flags email addresses', () => {
    const textWithEmail = 'Direct inquiries to patient.sharma@example.com for records.';
    const result = validateDeidentification(textWithEmail, mockPatient);
    expect(result.isValid).toBe(false);
    expect(result.leaks.some((l) => l.includes('Email address'))).toBe(true);
  });

  it('detects and flags calendar dates in DD/MM/YYYY and Month YYYY formats', () => {
    const textWithSlashDate = 'Biopsy performed on 12/05/2025 at external laboratory.';
    const result = validateDeidentification(textWithSlashDate, mockPatient);
    expect(result.isValid).toBe(false);
    expect(result.leaks.some((l) => l.includes('calendar date'))).toBe(true);
  });

  it('academic case report includes explicit non-certification disclaimer and relative days only', () => {
    const draft = generateStudioDraft({
      kind: 'academic_case_abstract',
      patient: mockPatient,
      facts: mockFacts,
    });

    expect(draft.isDeidentified).toBe(true);
    expect(draft.markdownBody).not.toContain('Ananya Sharma');
    expect(draft.markdownBody).not.toContain('MRN-987654');
    expect(draft.markdownBody).not.toContain('91-1234-5678-9012');
    expect(draft.markdownBody).not.toContain('2025-06-01');
    expect(draft.markdownBody).toContain('Day 0');
    expect(draft.markdownBody).toContain('Day +14');
    expect(draft.markdownBody).toContain('Algorithmic De-Identification Notice');
    expect(draft.markdownBody).toContain('does not constitute certified expert determination');
  });

  it('patient visit summary handout does not generate ungrounded emergency warning signs, medical instructions, or unanchored bring-items lists', () => {
    const draft = generateStudioDraft({
      kind: 'patient_info_sheet',
      patient: mockPatient,
      facts: mockFacts,
    });

    expect(draft.markdownBody).toContain('Confirmed Next Appointment Information');
    expect(draft.markdownBody).toContain('Records & Items to Bring');
    expect(draft.markdownBody).toContain('Important Administrative Disclaimer');
    expect(draft.markdownBody).toContain(
      'No specific document-bring instructions are recorded in verified source evidence for this visit.',
    );

    // Must NOT contain emergency clinical advice or medication changes
    expect(draft.markdownBody).not.toMatch(/immediately go to emergency|rush to ER|stop taking medication|increase dose/i);
    expect(draft.markdownBody).not.toMatch(/stage IV progression|high risk death|severe neutropenia alert/i);
  });

  it('rejects edited markdown when a cited lab value is tampered or violates clinical boundary', () => {
    const tamperedLabMarkdown = '- **20 Jun 2025**: Hemoglobin: 19.9 g/dL [E3]';
    const labCheck = revalidateStudioMarkdownCitations(tamperedLabMarkdown, mockFacts);
    expect(labCheck.valid).toBe(false);
    expect(labCheck.invalidCitations).toContain('[E3]:ungrounded_value');

    const boundaryViolationMarkdown = 'System recommended_treatment for carcinoma [E1].';
    const boundaryCheck = revalidateStudioMarkdownCitations(boundaryViolationMarkdown, mockFacts);
    expect(boundaryCheck.valid).toBe(false);
    expect(boundaryCheck.ungroundedClaims?.some((c) => c.includes('boundary_violation'))).toBe(true);
  });
});


describe('Studio exact-source approval gate regressions', () => {
  it.each([
    'Start chemotherapy tomorrow.',
    'Hemoglobin: 110.8 mg/dL [E3]',
    'Hemoglobin: 99 g/dL [E3] (original 10.8)',
    'Hemoglobin: 10.8 g/dL [E3]\nNew diagnosis: lung cancer.',
    'Metastatic brain cancer [E1]',
  ])('rejects unsupported edited clauses: %s', (body) => {
    expect(revalidateStudioMarkdownCitations(body, mockFacts).valid).toBe(false);
  });

  it('numbers citations by persisted cited-fact order, including excluded preceding facts', () => {
    const draft = generateStudioDraft({ kind: 'patient_info_sheet', patient: mockPatient, facts: [
      mockFacts[0]!,
      { ...mockFacts[1]!, evidenceFactId: 'appt', factType: 'appointment.recorded', valueText: 'Visit on Tuesday' },
    ] });
    expect(draft.citedFactIds).toEqual(['appt']);
    expect(draft.markdownBody).toContain('Visit on Tuesday [E1]');
  });
});
