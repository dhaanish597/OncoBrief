import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import { closePools } from '../src/client';
import { appClientForOrg, setupFixtures, type Fixtures } from './helpers';
import {
  createStudioArtifact,
  updateStudioArtifact,
  approveStudioArtifact,
  getStudioArtifact,
  listStudioArtifacts,
  assertStudioArtifactSourcesAccessible,
} from '../src/services/studio';

let fx: Fixtures;
let draftId: string;
let approvedId: string;

async function clinicianClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.clinician, 'clinician');
}

async function coordinatorClient(): Promise<Client> {
  return appClientForOrg(fx.org1, fx.clinicians.coordinator, 'coordinator');
}

async function org2Client(): Promise<Client> {
  return appClientForOrg(fx.org2, null, null);
}

beforeAll(async () => {
  fx = await setupFixtures();
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('Clinician Productivity Studio Database Service', () => {
  it('creates a studio artifact draft with valid citations and audits draft creation', async () => {
    const c = await clinicianClient();
    try {
      const artifact = await createStudioArtifact(c, {
        orgId: fx.org1,
        patientId: fx.patients.demo3,
        artifactKind: 'referral_letter',
        title: 'Specialist Transfer Letter — DEMO-003',
        markdownBody: '# Specialist Referral\nPatient evaluated for follow-up [E1].',
        citedFactIds: [fx.readyFactId],
        citedGuidelineIds: [],
        isDeidentified: false,
        createdBy: fx.clinicians.clinician,
      });

      expect(artifact.id).toBeDefined();
      expect(artifact.status).toBe('draft');
      expect(artifact.title).toBe('Specialist Transfer Letter — DEMO-003');
      expect(artifact.citedFactIds).toEqual([fx.readyFactId]);
      draftId = artifact.id;

      // Verify audit event
      const auditRes = await c.query<{ action: string }>(
        `SELECT action FROM audit_event WHERE org_id = $1 AND entity_id = $2`,
        [fx.org1, draftId],
      );
      expect(auditRes.rows.some((r) => r.action === 'studio.draft_created')).toBe(true);
    } finally {
      await c.end();
    }
  });

  it('updates draft content and citations successfully', async () => {
    const c = await clinicianClient();
    try {
      const updated = await updateStudioArtifact(c, {
        orgId: fx.org1,
        artifactId: draftId,
        title: 'Specialist Transfer Letter — Updated',
        markdownBody: '# Specialist Referral — Updated\nRevised content [E1].',
        citedFactIds: [fx.readyFactId],
        citedGuidelineIds: [],
        updatedBy: fx.clinicians.clinician,
      });

      expect(updated.title).toBe('Specialist Transfer Letter — Updated');
      expect(updated.markdownBody).toContain('Revised content');
    } finally {
      await c.end();
    }
  });

  it('refuses coordinator approval (requires clinician role)', async () => {
    const coord = await coordinatorClient();
    try {
      await expect(
        approveStudioArtifact(coord, {
          orgId: fx.org1,
          artifactId: draftId,
          approvedBy: fx.clinicians.coordinator,
          role: 'coordinator',
        }),
      ).rejects.toThrow(/clinician authority/i);
    } finally {
      await coord.end();
    }
  });

  it('approves artifact by clinician, hashes canonical snapshot payload, and freezes artifact', async () => {
    const c = await clinicianClient();
    try {
      const approved = await approveStudioArtifact(c, {
        orgId: fx.org1,
        artifactId: draftId,
        approvedBy: fx.clinicians.clinician,
        role: 'clinician',
      });

      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(fx.clinicians.clinician);
      expect(approved.approvedAt).toBeDefined();
      expect(approved.snapshotSha256).toBeDefined();
      expect(approved.snapshotSha256).toHaveLength(64); // 32 bytes hex

      // Verify canonical hash covers markdownBody, citedFactIds, citedGuidelineIds, approvedBy, and approvedAt
      const expectedCanonicalHash = createHash('sha256')
        .update(
          JSON.stringify({
            markdownBody: approved.markdownBody,
            citedFactIds: approved.citedFactIds,
            citedGuidelineIds: approved.citedGuidelineIds,
            approvedBy: approved.approvedBy,
            approvedAt: approved.approvedAt,
          }),
          'utf8',
        )
        .digest('hex');
      expect(approved.snapshotSha256).toBe(expectedCanonicalHash);
      approvedId = approved.id;

      // Immutability: Attempting to update approved artifact fails
      await expect(
        updateStudioArtifact(c, {
          orgId: fx.org1,
          artifactId: approvedId,
          title: 'Tampered Title',
          markdownBody: 'Tampered Body',
          citedFactIds: [],
          citedGuidelineIds: [],
          updatedBy: fx.clinicians.clinician,
        }),
      ).rejects.toThrow();
    } finally {
      await c.end();
    }
  });

  it('blocks studio approval and export access when a cited source document is withdrawn via consent revocation', async () => {
    const c = await clinicianClient();
    try {
      const docRes = await c.query<{ document_id: string }>(
        `SELECT document_id FROM evidence_fact WHERE id = $1`,
        [fx.readyFactId],
      );
      const docId = docRes.rows[0]!.document_id;

      const draft2 = await createStudioArtifact(c, {
          orgId: fx.org1,
          patientId: fx.patients.demo3,
          artifactKind: 'referral_letter',
          title: 'Draft With Withdrawn Source',
          markdownBody: '# Referral\nCiting withdrawn source [E1].',
          citedFactIds: [fx.readyFactId],
          citedGuidelineIds: [],
          createdBy: fx.clinicians.clinician,
        });

      // Simulate source consent withdrawal on the backing document
      await c.query(
        `UPDATE document SET ingest_error = 'consent_revoked_or_expired' WHERE id = $1`,
        [docId],
      );

      try {
        // Export access check on already-approved artifact must fail closed
        const accessCheck = await assertStudioArtifactSourcesAccessible(c, fx.org1, [fx.readyFactId]);
        expect(accessCheck.accessible).toBe(false);
        const restricted = await getStudioArtifact(c, fx.org1, approvedId);
        expect(restricted?.sourcesUnavailable).toBe(true);
        expect(restricted?.markdownBody).toBe('');
        expect(restricted?.title).not.toContain('Transfer');

        // Approval of a new draft citing the withdrawn fact must also fail closed


        await expect(
          approveStudioArtifact(c, {
            orgId: fx.org1,
            artifactId: draft2.id,
            approvedBy: fx.clinicians.clinician,
            role: 'clinician',
          }),
        ).rejects.toThrow('studio_source_withdrawn_or_unverified');
      } finally {
        // Restore document state for downstream tests
        await c.query(`UPDATE document SET ingest_error = NULL WHERE id = $1`, [docId]);
      }
    } finally {
      await c.end();
    }
  });

  it('enforces tenant isolation and rejects cross-tenant artifact access', async () => {
    const c2 = await org2Client();
    try {
      const result = await getStudioArtifact(c2, fx.org2, approvedId);
      expect(result).toBeNull();

      const list = await listStudioArtifacts(c2, fx.org2, fx.patients.demo3);
      expect(list).toHaveLength(0);
    } finally {
      await c2.end();
    }
  });
});
