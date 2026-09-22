import { NextResponse } from 'next/server';
import { appendAuditEvent, getPacket, packetExportJson } from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';
import { withTenant } from '@oncobrief/db';

/**
 * Packet export. Only an approved packet exports, and every export is audited
 * (architecture §11.2). The JSON embeds the frozen `snapshot_sha256`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ packetId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });

  const { packetId } = await params;

  const result = await withTenant(tenantCtx(session), async (q) => {
    const detail = await getPacket(q, session.orgId, packetId);
    if (!detail) return null;
    if (detail.status !== 'approved') return { error: 'not_approved' as const };

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'packet.exported',
      entityKind: 'consultation_packet',
      entityId: packetId,
      outcome: 'success',
      metadata: { format: 'json', snapshot_sha256: detail.snapshotSha256 },
    });

    return { detail };
  });

  if (!result) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  if ('error' in result) {
    return NextResponse.json(
      { error: { code: 'packet_not_approved', message: 'Only an approved packet may be exported.' } },
      { status: 409 },
    );
  }

  const body = packetExportJson(result.detail);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="oncobrief-packet-${packetId}.json"`,
    },
  });
}
