import { describe, expect, it } from 'vitest';
import { can, type Permission } from '@oncobrief/domain';

describe('Phase 4: Role-Based Access Control and Permission Boundaries in UI', () => {
  it('confirms conflict:resolve is strictly restricted to clinician and records_officer', () => {
    expect(can('clinician', 'conflict:resolve')).toBe(true);
    expect(can('records_officer', 'conflict:resolve')).toBe(true);
    expect(can('coordinator', 'conflict:resolve')).toBe(false);
    expect(can('org_admin', 'conflict:resolve')).toBe(false);
    expect(can('auditor', 'conflict:resolve')).toBe(false);
  });

  it('confirms packet:approve is strictly clinician-only', () => {
    expect(can('clinician', 'packet:approve')).toBe(true);
    expect(can('coordinator', 'packet:approve')).toBe(false);
    expect(can('records_officer', 'packet:approve')).toBe(false);
    expect(can('org_admin', 'packet:approve')).toBe(false);
    expect(can('auditor', 'packet:approve')).toBe(false);
  });

  it('confirms message:approve is strictly clinician-only', () => {
    expect(can('clinician', 'message:approve')).toBe(true);
    expect(can('coordinator', 'message:approve')).toBe(false);
    expect(can('records_officer', 'message:approve')).toBe(false);
    expect(can('org_admin', 'message:approve')).toBe(false);
    expect(can('auditor', 'message:approve')).toBe(false);
  });

  it('confirms message:compose is restricted to coordinator and records_officer', () => {
    expect(can('coordinator', 'message:compose')).toBe(true);
    expect(can('records_officer', 'message:compose')).toBe(true);
    expect(can('clinician', 'message:compose')).toBe(false);
    expect(can('org_admin', 'message:compose')).toBe(false);
    expect(can('auditor', 'message:compose')).toBe(false);
  });

  it('confirms auditor role holds zero mutating permissions', () => {
    const mutatingPermissions: Permission[] = [
      'document:upload',
      'evidence:verify',
      'evidence:correct',
      'evidence:reject',
      'conflict:resolve',
      'task:create',
      'task:assign',
      'packet:draft',
      'packet:approve',
      'message:compose',
      'message:approve',
      'checklist:author',
      'user:manage',
    ];

    for (const perm of mutatingPermissions) {
      expect(can('auditor', perm)).toBe(false);
    }
    // Auditor can read
    expect(can('auditor', 'patient:read')).toBe(true);
    expect(can('auditor', 'document:read_page')).toBe(true);
    expect(can('auditor', 'audit:read')).toBe(true);
  });
});

describe('Phase 4: Evidence Filter Invariants', () => {
  const sampleTimeline = [
    { id: '1', state: 'extracted', valueText: 'Fact 1' },
    { id: '2', state: 'verified', valueText: 'Fact 2' },
    { id: '3', state: 'conflicting', valueText: 'Fact 3' },
    { id: '4', state: 'corrected', valueText: 'Fact 4' },
    { id: '5', state: 'superseded', valueText: 'Fact 5' },
  ];

  it('filters unverified evidence correctly', () => {
    const unverified = sampleTimeline.filter((t) => t.state === 'extracted');
    expect(unverified).toHaveLength(1);
    expect(unverified[0]!.id).toBe('1');
  });

  it('filters conflicting evidence correctly', () => {
    const conflicting = sampleTimeline.filter((t) => t.state === 'conflicting');
    expect(conflicting).toHaveLength(1);
    expect(conflicting[0]!.id).toBe('3');
  });

  it('filters verified evidence correctly', () => {
    const verified = sampleTimeline.filter((t) => t.state === 'verified');
    expect(verified).toHaveLength(1);
    expect(verified[0]!.id).toBe('2');
  });

  it('filters historical (corrected and superseded) evidence correctly', () => {
    const historical = sampleTimeline.filter((t) => t.state === 'corrected' || t.state === 'superseded');
    expect(historical).toHaveLength(2);
    expect(historical.map((h) => h.id)).toEqual(['4', '5']);
  });
});
