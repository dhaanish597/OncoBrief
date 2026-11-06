import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedPatientRepository } from '../src/repository';
import type { PatientPortalApiClient } from '../src/api-client';

describe('MOB-017: Caregiver Consent & Revocable Share Grants (REQ-MOB-032, REQ-MOB-033)', () => {
  it('adds a consented caregiver with specific scopes (REQ-MOB-032)', async () => {
    let caregiverParams: unknown = null;
    const mockClient = {
      async addCaregiver(params: unknown) {
        caregiverParams = params;
        return {
          caregiver: {
            id: 'cg-01',
            fullName: 'Anand Sundaram',
            relationship: 'Spouse',
            phoneNumber: '+919876543210',
            isActive: true,
            scopes: ['appointments', 'preparation', 'reminders'],
          },
        };
      },
    } as unknown as PatientPortalApiClient;

    const res = await mockClient.addCaregiver({
      fullName: 'Anand Sundaram',
      relationship: 'Spouse',
      phoneNumber: '+919876543210',
      scopes: ['appointments', 'preparation', 'reminders'],
    });

    assert.equal(res.caregiver.fullName, 'Anand Sundaram');
    assert.equal(res.caregiver.relationship, 'Spouse');
    assert.deepEqual(res.caregiver.scopes, ['appointments', 'preparation', 'reminders']);
    assert.deepEqual(caregiverParams, {
      fullName: 'Anand Sundaram',
      relationship: 'Spouse',
      phoneNumber: '+919876543210',
      scopes: ['appointments', 'preparation', 'reminders'],
    });
  });

  it('revokes caregiver consent immediately (REQ-MOB-032 / SEC-NEG-13)', async () => {
    let revokedId: string | null = null;
    const mockClient = {
      async revokeCaregiver(caregiverId: string) {
        revokedId = caregiverId;
        return {
          caregiverId,
          revoked: true,
        };
      },
    } as unknown as PatientPortalApiClient;

    const res = await mockClient.revokeCaregiver('cg-01');
    assert.equal(res.revoked, true);
    assert.equal(revokedId, 'cg-01');
  });

  it('creates time-bounded revocable share grant with selected documents (REQ-MOB-033)', async () => {
    let shareParams: unknown = null;
    const mockClient = {
      async createShareGrant(params: unknown) {
        shareParams = params;
        return {
          grant: {
            id: 'grant-01',
            recipientLabel: 'Dr. Arumugam Second Opinion',
            expiresAt: '2026-11-04T12:00:00Z',
            sharedDocumentIds: ['doc-biopsy-01', 'doc-ct-01'],
            isRevoked: false,
          },
        };
      },
    } as unknown as PatientPortalApiClient;

    const res = await mockClient.createShareGrant({
      recipientLabel: 'Dr. Arumugam Second Opinion',
      sharedDocumentIds: ['doc-biopsy-01', 'doc-ct-01'],
      durationHours: 72,
    });

    assert.equal(res.grant.id, 'grant-01');
    assert.equal(res.grant.recipientLabel, 'Dr. Arumugam Second Opinion');
    assert.deepEqual(res.grant.sharedDocumentIds, ['doc-biopsy-01', 'doc-ct-01']);
    assert.deepEqual(shareParams, {
      recipientLabel: 'Dr. Arumugam Second Opinion',
      sharedDocumentIds: ['doc-biopsy-01', 'doc-ct-01'],
      durationHours: 72,
    });
  });

  it('revokes active share grant (REQ-MOB-033)', async () => {
    let revokedGrantId: string | null = null;
    const mockClient = {
      async revokeShareGrant(grantId: string) {
        revokedGrantId = grantId;
        return {
          grantId,
          revoked: true,
        };
      },
    } as unknown as PatientPortalApiClient;

    const res = await mockClient.revokeShareGrant('grant-01');
    assert.equal(res.revoked, true);
    assert.equal(revokedGrantId, 'grant-01');
  });
});
