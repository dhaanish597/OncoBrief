'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@oncobrief/domain';
import {
  createAppointment,
  rescheduleAppointment,
  changeAppointmentStatus,
  recordClinicianUnavailability,
  type AppointmentType,
  type ArrivalCategory,
  type AppointmentStatus,
} from '@oncobrief/db';
import { requireSession, withSession } from '@/lib/session';

export async function createAppointmentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'appointment:create')) {
    throw new Error('forbidden: User role lacks appointment:create permission');
  }

  const patientId = String(formData.get('patientId') || '').trim();
  const clinicianId = String(formData.get('clinicianId') || '').trim();
  const scheduledStart = String(formData.get('scheduledStart') || '').trim();
  const scheduledEnd = String(formData.get('scheduledEnd') || '').trim();
  const roomLabel = String(formData.get('roomLabel') || 'OPD Room 1').trim();
  const appointmentType = (String(formData.get('appointmentType') || 'follow_up') as AppointmentType);
  const arrivalCategory = (String(formData.get('arrivalCategory') || 'scheduled') as ArrivalCategory);
  const notes = String(formData.get('notes') || '').trim() || null;
  const facilityId = String(formData.get('facilityId') || '').trim() || null;
  const departmentId = String(formData.get('departmentId') || '').trim() || null;

  if (!patientId) throw new Error('Patient is required');
  if (!clinicianId) throw new Error('Clinician is required');
  if (!scheduledStart || !scheduledEnd) throw new Error('Start and end times are required');

  await withSession(async (q, s) => {
    return createAppointment(q, {
      orgId: s.orgId,
      patientId,
      clinicianId,
      facilityId,
      departmentId,
      scheduledStart,
      scheduledEnd,
      roomLabel,
      appointmentType,
      arrivalCategory,
      notes,
      actorId: s.userId,
    });
  });

  revalidatePath('/appointments');
  revalidatePath('/appointments/calendar');
  revalidatePath('/workspace');
  revalidatePath(`/patients/${patientId}/overview`);
  redirect('/appointments');
}

export async function rescheduleAppointmentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'appointment:update')) {
    throw new Error('forbidden: User role lacks appointment:update permission');
  }

  const appointmentId = String(formData.get('appointmentId') || '').trim();
  const newStart = String(formData.get('newStart') || '').trim();
  const newEnd = String(formData.get('newEnd') || '').trim();
  const roomLabel = String(formData.get('roomLabel') || '').trim() || undefined;
  const reason = String(formData.get('reason') || '').trim() || undefined;

  if (!appointmentId) throw new Error('Appointment ID is required');
  if (!newStart || !newEnd) throw new Error('New start and end times are required');

  await withSession(async (q, s) => {
    return rescheduleAppointment(q, {
      orgId: s.orgId,
      appointmentId,
      newStart,
      newEnd,
      roomLabel,
      reason,
      actorId: s.userId,
    });
  });

  revalidatePath('/appointments');
  revalidatePath('/appointments/calendar');
  revalidatePath('/workspace');
}

export async function changeAppointmentStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'appointment:update')) {
    throw new Error('forbidden: User role lacks appointment:update permission');
  }

  const appointmentId = String(formData.get('appointmentId') || '').trim();
  const toStatus = String(formData.get('toStatus') || '') as AppointmentStatus;
  const reason = String(formData.get('reason') || '').trim() || null;

  if (!appointmentId) throw new Error('Appointment ID is required');
  if (!toStatus) throw new Error('Target status is required');
  if (toStatus === 'cancelled' && !reason) {
    throw new Error('A cancellation reason is required');
  }

  await withSession(async (q, s) => {
    return changeAppointmentStatus(q, {
      orgId: s.orgId,
      appointmentId,
      toStatus,
      reason,
      actorId: s.userId,
    });
  });

  revalidatePath('/appointments');
  revalidatePath('/appointments/calendar');
  revalidatePath('/workspace');
}

export async function recordClinicianUnavailabilityAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!can(session.role, 'appointment:update')) {
    throw new Error('forbidden: User role lacks clinician schedule update permission');
  }

  const clinicianId = String(formData.get('clinicianId') || '').trim();
  const startTime = String(formData.get('startTime') || '').trim();
  const endTime = String(formData.get('endTime') || '').trim();
  const reason = String(formData.get('reason') || '').trim();

  if (!clinicianId) throw new Error('Clinician is required');
  if (!startTime || !endTime) throw new Error('Start and end time are required');
  if (!reason) throw new Error('Reason is required');

  await withSession(async (q, s) => {
    return recordClinicianUnavailability(q, {
      orgId: s.orgId,
      clinicianId,
      startTime,
      endTime,
      reason,
      actorId: s.userId,
    });
  });

  revalidatePath('/appointments');
  revalidatePath('/appointments/calendar');
}
