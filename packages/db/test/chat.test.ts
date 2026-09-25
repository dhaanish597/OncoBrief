import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../src/client';
import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from '../src/services/patients';
import { closePools } from '../src/client';
import { setupFixtures, withSuperuser, type Fixtures } from './helpers';

/**
 * Ask OncoBrief persistence. Conversations are user-owned and tenant-scoped;
 * one user must never be able to read or delete another's.
 */
let fx: Fixtures;
let org2UserId: string;

beforeAll(async () => {
  fx = await setupFixtures();
  const row = await withSuperuser((c) =>
    c.query<{ user_id: string }>(
      `SELECT m.user_id FROM membership m WHERE m.org_id = $1 LIMIT 1`,
      [fx.org2],
    ),
  );
  org2UserId = row.rows[0]!.user_id;
}, 120_000);

afterAll(async () => {
  await closePools();
});

describe('conversation persistence', () => {
  it('stores and reads back a conversation with its messages', async () => {
    const userId = fx.clinicians.clinician;
    const result = await withTenant({ orgId: fx.org1, userId, role: 'clinician' }, async (q) => {
      const { id } = await createConversation(q, { orgId: fx.org1, userId, patientId: fx.patients.demo1, title: 'Pathology' });
      await addMessage(q, { conversationId: id, role: 'user', content: 'What is the latest pathology report?' });
      await addMessage(q, {
        conversationId: id,
        role: 'assistant',
        content: 'The report shows X.',
        intent: 'evidence_question',
        grounded: true,
        sources: [{ evidenceFactId: 'e1' }],
      });
      const conv = await getConversation(q, id, userId);
      return { id, conv };
    });

    expect(result.conv).not.toBeNull();
    expect(result.conv!.messages).toHaveLength(2);
    expect(result.conv!.messages[0]!.role).toBe('user');
    expect(result.conv!.messages[1]!.grounded).toBe(true);
    expect(result.conv!.messages[1]!.sources).toEqual([{ evidenceFactId: 'e1' }]);
  });

  it('isolates history between users in the same organisation', async () => {
    const owner = fx.clinicians.clinician;
    const other = fx.clinicians.coordinator;

    const conversationId = await withTenant({ orgId: fx.org1, userId: owner, role: 'clinician' }, async (q) => {
      const { id } = await createConversation(q, { orgId: fx.org1, userId: owner, patientId: fx.patients.demo1 });
      await addMessage(q, { conversationId: id, role: 'user', content: 'private note' });
      return id;
    });

    const asOther = await withTenant({ orgId: fx.org1, userId: other, role: 'coordinator' }, (q) =>
      getConversation(q, conversationId, other),
    );
    expect(asOther).toBeNull();

    const listedForOther = await withTenant({ orgId: fx.org1, userId: other, role: 'coordinator' }, (q) =>
      listConversations(q, other),
    );
    expect(listedForOther.some((c) => c.id === conversationId)).toBe(false);
  });

  it('isolates conversations across tenants, and never confirms existence', async () => {
    const ownerId = fx.clinicians.clinician;
    const conversationId = await withTenant({ orgId: fx.org1, userId: ownerId, role: 'clinician' }, async (q) => {
      const { id } = await createConversation(q, { orgId: fx.org1, userId: ownerId, patientId: fx.patients.demo1 });
      return id;
    });

    // A user in the other tenant, with the other tenant's context.
    const crossTenant = await withTenant({ orgId: fx.org2, userId: org2UserId, role: 'clinician' }, (q) =>
      getConversation(q, conversationId, org2UserId),
    );
    expect(crossTenant).toBeNull();
  });

  it('deletes a conversation and its messages, owner only', async () => {
    const owner = fx.clinicians.clinician;
    const other = fx.clinicians.coordinator;

    const conversationId = await withTenant({ orgId: fx.org1, userId: owner, role: 'clinician' }, async (q) => {
      const { id } = await createConversation(q, { orgId: fx.org1, userId: owner, patientId: fx.patients.demo1 });
      await addMessage(q, { conversationId: id, role: 'user', content: 'delete me' });
      return id;
    });

    // A non-owner delete is a no-op.
    await withTenant({ orgId: fx.org1, userId: other, role: 'coordinator' }, (q) =>
      deleteConversation(q, conversationId, other),
    );
    const stillThere = await withTenant({ orgId: fx.org1, userId: owner, role: 'clinician' }, (q) =>
      getConversation(q, conversationId, owner),
    );
    expect(stillThere).not.toBeNull();

    // The owner can delete it.
    await withTenant({ orgId: fx.org1, userId: owner, role: 'clinician' }, (q) =>
      deleteConversation(q, conversationId, owner),
    );
    const gone = await withTenant({ orgId: fx.org1, userId: owner, role: 'clinician' }, (q) =>
      getConversation(q, conversationId, owner),
    );
    expect(gone).toBeNull();
  });
});
