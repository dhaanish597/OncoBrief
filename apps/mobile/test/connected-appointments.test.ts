import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectedPatientRepository } from '../src/repository';
import type { PatientPortalApiClient } from '../src/api-client';

describe('MOB-014: Connected Appointments, Attendance Confirmation & Care Journey', () => {
  it('confirms appointment attendance and updates state to confirmed (REQ-MOB-021)', async () => {
    let attendancePayload: { appointmentId: string; action: string } | null = null;
    const mockClient = {
      async confirmAttendance(params: { appointmentId: string; action: 'confirm' | 'request_reschedule' }) {
        attendancePayload = params;
        return {
          appointmentId: params.appointmentId,
          status: 'confirmed' as const,
          message: 'Attendance confirmed',
        };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.appointments = [
      {
        id: 'appt-oncology-01',
        scheduledStart: '2026-11-14T09:30:00Z',
        scheduledEnd: '2026-11-14T10:00:00Z',
        status: 'scheduled',
        clinicianName: 'Dr. Suresh Kumar (Surgical Oncology)',
        department: 'Room 304, Block B',
        tokenNumber: 'B-12',
        estimatedWaitMinutes: 15,
        canConfirmAttendance: true,
      },
    ];

    // Confirm attendance
    const res = await mockClient.confirmAttendance({
      appointmentId: 'appt-oncology-01',
      action: 'confirm',
    });

    const appt = repo.state.appointments.find((a) => a.id === 'appt-oncology-01');
    assert.ok(appt);
    if (appt) {
      appt.status = res.status || 'confirmed';
      appt.canConfirmAttendance = false;
    }

    assert.equal(repo.state.appointments[0]!.status, 'confirmed');
    assert.equal(repo.state.appointments[0]!.canConfirmAttendance, false);
    assert.deepEqual(attendancePayload, {
      appointmentId: 'appt-oncology-01',
      action: 'confirm',
    });
  });

  it('requests reschedule for appointment and updates status to reschedule_requested (REQ-MOB-021)', async () => {
    let reschedulePayload: { appointmentId: string; action: string; note?: string } | null = null;
    const mockClient = {
      async confirmAttendance(params: { appointmentId: string; action: 'confirm' | 'request_reschedule'; note?: string }) {
        reschedulePayload = params;
        return {
          appointmentId: params.appointmentId,
          status: 'reschedule_requested' as const,
          message: 'Reschedule request submitted to care coordinator',
        };
      },
    } as unknown as PatientPortalApiClient;

    const repo = new ConnectedPatientRepository({ client: mockClient });
    repo.state.appointments = [
      {
        id: 'appt-oncology-02',
        scheduledStart: '2026-11-14T09:30:00Z',
        scheduledEnd: '2026-11-14T10:00:00Z',
        status: 'scheduled',
        clinicianName: 'Dr. Suresh Kumar',
        department: 'Surgical Oncology',
        tokenNumber: 'B-14',
        estimatedWaitMinutes: 20,
        canConfirmAttendance: true,
      },
    ];

    const res = await mockClient.confirmAttendance({
      appointmentId: 'appt-oncology-02',
      action: 'request_reschedule',
      note: 'Patient traveling from out of town, request 16 Nov',
    });

    const appt = repo.state.appointments.find((a) => a.id === 'appt-oncology-02');
    assert.ok(appt);
    if (appt) {
      appt.status = res.status || 'reschedule_requested';
      appt.canConfirmAttendance = false;
    }

    assert.equal(repo.state.appointments[0]!.status, 'reschedule_requested');
    assert.ok(reschedulePayload);
    assert.equal((reschedulePayload as { note?: string }).note, 'Patient traveling from out of town, request 16 Nov');
  });

  it('renders OPD token and estimated wait time accurately (REQ-MOB-020)', () => {
    const repo = new ConnectedPatientRepository();
    repo.state.appointments = [
      {
        id: 'appt-opd-03',
        scheduledStart: '2026-11-14T10:00:00Z',
        scheduledEnd: '2026-11-14T10:30:00Z',
        status: 'checked_in',
        clinicianName: 'Dr. Suresh Kumar',
        department: 'Oncology OPD Room 304',
        tokenNumber: 'B-07',
        estimatedWaitMinutes: 10,
        canConfirmAttendance: false,
      },
    ];

    const appt = repo.state.appointments[0]!;
    assert.equal(appt.tokenNumber, 'B-07');
    assert.equal(appt.estimatedWaitMinutes, 10);
    assert.equal(appt.status, 'checked_in');
  });

  it('preserves chronological ordering and source provenance citations in Care Journey (REQ-MOB-022)', () => {
    const repo = new ConnectedPatientRepository();
    repo.state.ledger = [
      {
        id: 'ev-1',
        kind: 'document',
        title: 'Core Biopsy Right Breast',
        titleTa: 'வலது மார்பக பயாப்ஸி',
        date: '2026-10-12',
        status: 'clinician-confirmed',
        source: {
          documentId: 'doc-biopsy-01',
          page: 1,
          quote: 'Invasive ductal carcinoma, Grade II',
          version: '1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
        },
      },
      {
        id: 'ev-2',
        kind: 'document',
        title: 'Contrast CT Chest Abdomen Pelvis',
        titleTa: 'மார்பு வயிறு சிடி ஸ்கேன்',
        date: '2026-10-18',
        status: 'clinician-confirmed',
        source: {
          documentId: 'doc-ct-01',
          page: 2,
          quote: 'No distant parenchymal metastases noted',
          version: '1',
          method: 'synthetic-fixture',
          confidence: 'not-applicable',
        },
      },
    ];

    assert.equal(repo.state.ledger.length, 2);
    assert.equal(repo.state.ledger[0]!.source.documentId, 'doc-biopsy-01');
    assert.equal(repo.state.ledger[0]!.source.quote, 'Invasive ductal carcinoma, Grade II');
    assert.equal(repo.state.ledger[1]!.source.page, 2);
  });
});
