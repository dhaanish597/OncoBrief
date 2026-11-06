import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { env } from '@oncobrief/db';
import { closePools, withTenant } from '@oncobrief/db';
import {
  listVerifiedPatientStagingFacts,
  registerTumorBoardCase,
  createTumorBoardMeeting,
} from '@oncobrief/db';
import { insertFact, verifyEvidence } from '@oncobrief/db';
import { setupFixtures, type Fixtures } from '../../../../packages/db/test/helpers';

let fx: Fixtures;

beforeAll(async () => {
  fx = await setupFixtures();
}, 120000);

afterAll(closePools);

describe('TASK-03.01: Environment Configuration Governance', () => {
  it('resolves EXTRACTION_DRIVER over EXTRACTOR_DRIVER with rule and bedrock drivers', () => {
    const originalExtraction = process.env.EXTRACTION_DRIVER;
    const originalExtractor = process.env.EXTRACTOR_DRIVER;

    try {
      // 1. EXTRACTION_DRIVER takes precedence
      delete process.env.EXTRACTOR_DRIVER;
      process.env.EXTRACTION_DRIVER = 'rule';
      expect(env.extractorDriver).toBe('rule');

      process.env.EXTRACTION_DRIVER = 'bedrock';
      expect(env.extractorDriver).toBe('bedrock');

      // 2. Legacy EXTRACTOR_DRIVER fallback works when EXTRACTION_DRIVER is unset
      delete process.env.EXTRACTION_DRIVER;
      process.env.EXTRACTOR_DRIVER = 'rule';
      expect(env.extractorDriver).toBe('rule');

      // 3. Default is auto
      delete process.env.EXTRACTOR_DRIVER;
      expect(env.extractorDriver).toBe('auto');
    } finally {
      if (originalExtraction !== undefined) {
        process.env.EXTRACTION_DRIVER = originalExtraction;
      } else {
        delete process.env.EXTRACTION_DRIVER;
      }
      if (originalExtractor !== undefined) {
        process.env.EXTRACTOR_DRIVER = originalExtractor;
      } else {
        delete process.env.EXTRACTOR_DRIVER;
      }
    }
  });
});

describe('TASK-03.01: Tumor Board Clinical Governance & Staging Facts', () => {
  it('listVerifiedPatientStagingFacts returns only verified/corrected staging facts and excludes diagnosis facts', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    await withTenant(ctx, async (q) => {
      // Insert a verified staging fact for demo3
      const stageFact = await insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'stage_text.as_written',
        value: { kind: 'text', text: 'cT2aN1M0 Stage IIB' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'human',
        extractorName: 'human.test',
        extractorVersion: 'v1',
        confidenceRaw: null,
        createdBy: fx.clinicians.clinician,
      });
      expect(stageFact.ok).toBe(true);
      if (!stageFact.ok) return;

      // Mark it verified
      await verifyEvidence(q, {
        factId: stageFact.factId,
        actor: { kind: 'human', userId: fx.clinicians.clinician, role: 'clinician' },
      });

      // Insert a diagnosis fact (should NOT be returned as a staging fact)
      const diagFact = await insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: 'Invasive ductal carcinoma' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'human',
        extractorName: 'human.test',
        extractorVersion: 'v1',
        confidenceRaw: null,
        createdBy: fx.clinicians.clinician,
      });
      expect(diagFact.ok).toBe(true);
      if (!diagFact.ok) return;

      await verifyEvidence(q, {
        factId: diagFact.factId,
        actor: { kind: 'human', userId: fx.clinicians.clinician, role: 'clinician' },
      });

      // Query staging facts for demo3
      const stagingFacts = await listVerifiedPatientStagingFacts(q, fx.org1, fx.patients.demo3);
      expect(stagingFacts.some((f) => f.id === stageFact.factId)).toBe(true);
      expect(stagingFacts.some((f) => f.id === diagFact.factId)).toBe(false);

      // Verify scoping: query for demo1 should NOT return demo3's staging fact
      const demo1Staging = await listVerifiedPatientStagingFacts(q, fx.org1, fx.patients.demo1);
      expect(demo1Staging.some((f) => f.id === stageFact.factId)).toBe(false);
    });
  });

  it('rejects registering a Tumor Board case when stagingFactId belongs to another patient', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    await withTenant(ctx, async (q) => {
      // Create a meeting
      const meetingId = await createTumorBoardMeeting(q, {
        orgId: fx.org1,
        title: 'Cross-Patient Governance Test Board',
        meetingDate: '2026-11-15',
        startTime: '10:00:00',
        endTime: '11:00:00',
        location: 'Room 101',
        actorId: fx.clinicians.clinician,
      });

      // Insert a verified staging fact for demo3
      const stageFact = await insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'stage_text.as_written',
        value: { kind: 'text', text: 'cT2aN1M0 Stage IIB' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'human',
        extractorName: 'human.test',
        extractorVersion: 'v1',
        confidenceRaw: null,
        createdBy: fx.clinicians.clinician,
      });
      expect(stageFact.ok).toBe(true);
      if (!stageFact.ok) return;

      await verifyEvidence(q, {
        factId: stageFact.factId,
        actor: { kind: 'human', userId: fx.clinicians.clinician, role: 'clinician' },
      });

      // Attempt to register a case for patient demo1 using demo3's staging fact -> MUST BE REJECTED!
      await expect(
        registerTumorBoardCase(q, {
          orgId: fx.org1,
          meetingId,
          patientId: fx.patients.demo1, // Different patient!
          stagingFactId: stageFact.factId,
          actorId: fx.clinicians.clinician,
        }),
      ).rejects.toThrow('invalid_tumor_board_staging_fact');
    });
  });

  it('rejects registering a Tumor Board case when stagingFactId is a diagnosis fact rather than staging', async () => {
    const ctx = { orgId: fx.org1, userId: fx.clinicians.clinician, role: 'clinician' as const };

    await withTenant(ctx, async (q) => {
      const meetingId = await createTumorBoardMeeting(q, {
        orgId: fx.org1,
        title: 'Diagnosis Fact Staging Misuse Test Board',
        meetingDate: '2026-11-15',
        startTime: '14:00:00',
        endTime: '15:00:00',
        location: 'Room 102',
        actorId: fx.clinicians.clinician,
      });

      // Insert a verified diagnosis fact
      const diagFact = await insertFact(q, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        factType: 'diagnosis_text.as_written',
        value: { kind: 'text', text: 'Adenocarcinoma' },
        verbatimQuote: fx.sampleSpanText,
        spanIds: [fx.sampleSpanId],
        documentId: fx.sampleDocumentId,
        extractorKind: 'human',
        extractorName: 'human.test',
        extractorVersion: 'v1',
        confidenceRaw: null,
        createdBy: fx.clinicians.clinician,
      });
      expect(diagFact.ok).toBe(true);
      if (!diagFact.ok) return;

      await verifyEvidence(q, {
        factId: diagFact.factId,
        actor: { kind: 'human', userId: fx.clinicians.clinician, role: 'clinician' },
      });

      // Attempt to register staging using a diagnosis fact -> MUST BE REJECTED!
      await expect(
        registerTumorBoardCase(q, {
          orgId: fx.org1,
          meetingId,
          patientId: fx.patients.demo3,
          stagingFactId: diagFact.factId,
          actorId: fx.clinicians.clinician,
        }),
      ).rejects.toThrow('invalid_tumor_board_staging_fact');
    });
  });
});
