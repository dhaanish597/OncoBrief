'use server';

import { revalidatePath } from 'next/cache';
import { assignTask, createInstructionTask, waiveGap } from '@oncobrief/db';
import { isTaskKind } from '@oncobrief/domain';
import { withSession } from './session';
export type OwnershipResult = { ok: boolean; message: string };
const field = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

export async function confirmTaskOwnershipAction(
  _previous: OwnershipResult,
  fd: FormData,
): Promise<OwnershipResult> {
  try {
    if (fd.get('confirmed') !== 'on') throw new Error('confirmation_required');
    await withSession(async (q, s) => {
      const task = await q.query('SELECT id FROM admin_task WHERE id=$1 AND patient_id=$2', [
        field(fd, 'taskId'),
        field(fd, 'patientId'),
      ]);
      if (!task.rows[0]) throw new Error('task_not_found');
      await assignTask(q, {
        taskId: field(fd, 'taskId'),
        assigneeId: field(fd, 'assigneeId'),
        actorId: s.userId,
        expectedAssigneeId: field(fd, 'expectedAssigneeId') || null,
        dueOn: field(fd, 'dueOn') || null,
      });
    });
    revalidatePath(`/patients/${field(fd, 'patientId')}/tasks`);
    return { ok: true, message: 'Task ownership confirmed and audited.' };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmGapWaiverAction(
  _previous: OwnershipResult,
  fd: FormData,
): Promise<OwnershipResult> {
  try {
    if (fd.get('confirmed') !== 'on') throw new Error('confirmation_required');
    await withSession(async (q, s) => {
      const gap = await q.query('SELECT id FROM record_gap WHERE id=$1 AND patient_id=$2', [
        field(fd, 'gapId'),
        field(fd, 'patientId'),
      ]);
      if (!gap.rows[0]) throw new Error('gap_not_found');
      await waiveGap(q, {
        gapId: field(fd, 'gapId'),
        userId: s.userId,
        reason: field(fd, 'reason'),
      });
    });
    revalidatePath(`/patients/${field(fd, 'patientId')}`);
    revalidatePath('/workspace');
    return {
      ok: true,
      message: 'Administrative waiver recorded. Record readiness recomputed.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmInstructionTaskAction(
  _previous: OwnershipResult,
  fd: FormData,
): Promise<OwnershipResult> {
  try {
    const taskKind = field(fd, 'taskKind');
    if (!isTaskKind(taskKind)) throw new Error('unknown_task_kind');
    await withSession((q, s) =>
      createInstructionTask(q, {
        patientId: field(fd, 'patientId'),
        evidenceFactId: field(fd, 'factId'),
        actorId: s.userId,
        taskKind,
        confirmedAdministrative: fd.get('confirmed') === 'on',
        dueOn: field(fd, 'dueOn') || null,
      }),
    );
    revalidatePath(`/patients/${field(fd, 'patientId')}/tasks`);
    return {
      ok: true,
      message: 'Source-backed administrative task confirmed.',
    };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): OwnershipResult {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    forbidden: 'Your current role does not permit this action.',
    invalid_assignee: 'This staff member is no longer eligible.',
    task_assignment_stale: 'Ownership changed. Refresh the page before confirming.',
    task_closed: 'This task is already closed.',
    invalid_due_date: 'Choose a valid calendar date.',
    waiver_reason_required: 'Enter an explicit administrative reason.',
    only_expected_administrative_items_may_be_waived:
      'Only expected administrative checklist items can be waived.',
    verified_instruction_not_accessible: 'The instruction is no longer verified or accessible.',
    confirmation_required: 'Explicit confirmation is required.',
    administrative_confirmation_required:
      'Confirm this is a documented administrative instruction.',
  };
  return {
    ok: false,
    message: messages[code] ?? 'The update could not be saved. Refresh and try again.',
  };
}
