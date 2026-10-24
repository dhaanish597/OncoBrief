import { NextResponse } from 'next/server';
import { can } from '@oncobrief/domain';
import {
  appendAuditEvent,
  assertPacketSourcesAccessible,
  getPacket,
  packetExportJson,
  getPacketExportBundle,
  withTenant,
} from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';

/**
 * Packet export. Only an approved packet whose backing sources have not been
 * withdrawn under consent revocation exports, and every export is audited
 * (architecture §11.2). The JSON embeds the frozen `snapshot_sha256`.
 * Supports ?format=json (default), ?format=abdm (NRCeS v6.5.0 FHIR DocumentBundle),
 * and ?format=mcode (mCODE STU4 FHIR collection Bundle).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ packetId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });

  if (!can(session.role, 'packet:export')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  const { packetId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';

  const result = await withTenant(tenantCtx(session), async (q) => {
    const detail = await getPacket(q, session.orgId, packetId);
    if (!detail) return null;
    if (detail.status !== 'approved') return { error: 'not_approved' as const };

    try {
      await assertPacketSourcesAccessible(q, session.orgId, packetId);
    } catch {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: session.userId, role: session.role },
        action: 'packet.exported',
        entityKind: 'consultation_packet',
        entityId: packetId,
        outcome: 'denied',
        metadata: { format, reason: 'packet_source_withdrawn' },
      });
      return { error: 'source_withdrawn' as const };
    }

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'packet.exported',
      entityKind: 'consultation_packet',
      entityId: packetId,
      outcome: 'success',
      metadata: { format, snapshot_sha256: detail.snapshotSha256 },
    });

    if (format === 'abdm' || format === 'mcode') {
      const bundle = await getPacketExportBundle(q, session.orgId, packetId, format);
      return { bundle, format };
    }

    return { detail, format: 'json' };
  });

  if (!result) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  if ('error' in result) {
    if (result.error === 'source_withdrawn') {
      return NextResponse.json(
        {
          error: {
            code: 'packet_source_withdrawn',
            message: 'Cannot export packet because an underlying source document was withdrawn or revoked.',
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'packet_not_approved', message: 'Only an approved packet may be exported.' } },
      { status: 409 },
    );
  }

  if (result.format === 'abdm') {
    return new NextResponse(JSON.stringify(result.bundle, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/fhir+json',
        'content-disposition': `attachment; filename="oncobrief-packet-${packetId}-abdm-fhir.json"`,
      },
    });
  }

  if (result.format === 'mcode') {
    return new NextResponse(JSON.stringify(result.bundle, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/fhir+json',
        'content-disposition': `attachment; filename="oncobrief-packet-${packetId}-mcode-fhir.json"`,
      },
    });
  }

  const body = packetExportJson(result.detail!);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="oncobrief-packet-${packetId}.json"`,
    },
  });
}
