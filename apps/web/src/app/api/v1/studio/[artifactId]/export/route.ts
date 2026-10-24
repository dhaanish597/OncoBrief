import { NextResponse } from 'next/server';
import { can, exportToAbdmDocumentBundle, exportToMCodeBundle, type FactWithProvenance } from '@oncobrief/domain';
import {
  appendAuditEvent,
  assertStudioArtifactSourcesAccessible,
  getPatient,
  getStudioArtifact,
  getTimeline,
  verifyStudioArtifactSnapshot,
  withTenant,
} from '@oncobrief/db';
import { getSession, tenantCtx } from '@/lib/session';
import { assertStudioArtifactContentSafe } from '@/lib/studio-validation';

/**
 * Studio Artifact export endpoint.
 * Only approved artifacts whose cited sources remain under active consent export,
 * and every export attempt is audited.
 * Supports:
 * - format=markdown (raw source-cited draft)
 * - format=json (structured metadata + markdown body)
 * - format=abdm (NRCeS v6.5.0 FHIR DocumentBundle scoped to cited facts)
 * - format=mcode (HL7 mCODE STU4 FHIR Bundle scoped to cited facts)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });

  if (!can(session.role, 'packet:export')) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  const { artifactId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'markdown';

  const result = await withTenant(tenantCtx(session), async (q) => {
    const artifact = await getStudioArtifact(q, session.orgId, artifactId);
    if (!artifact) return null;
    if (artifact.status !== 'approved') return { error: 'not_approved' as const };

    // Verify no cited source document was withdrawn (e.g., consent_revoked_or_expired) after approval
    const sourceAccess = await assertStudioArtifactSourcesAccessible(
      q,
      session.orgId,
      artifact.citedFactIds,
    );
    if (!sourceAccess.accessible) {
      await appendAuditEvent(q, {
        orgId: session.orgId,
        actor: { userId: session.userId, role: session.role },
        action: 'studio.exported',
        entityKind: 'studio_artifact',
        entityId: artifactId,
        outcome: 'denied',
        metadata: {
          format,
          artifact_kind: artifact.artifactKind,
          expected_facts: sourceAccess.expectedCount,
          available_facts: sourceAccess.availableCount,
        },
      });
      return { error: 'source_withdrawn' as const };
    }

    if (!verifyStudioArtifactSnapshot(artifact) || (artifact.isDeidentified && (format === 'abdm' || format === 'mcode'))) {
      const reason = artifact.isDeidentified && (format === 'abdm' || format === 'mcode')
        ? 'deidentified_fhir_not_supported' as const : 'snapshot_integrity_failed' as const;
      await appendAuditEvent(q, { orgId: session.orgId,
        actor: { userId: session.userId, role: session.role }, action: 'studio.exported',
        entityKind: 'studio_artifact', entityId: artifactId, outcome: 'denied', metadata: { format, reason } });
      return { error: reason };
    }

    try {
      await assertStudioArtifactContentSafe(q, session, artifact);
    } catch {
      await appendAuditEvent(q, { orgId: session.orgId,
        actor: { userId: session.userId, role: session.role }, action: 'studio.exported',
        entityKind: 'studio_artifact', entityId: artifactId, outcome: 'denied',
        metadata: { format, reason: 'unsupported_approved_content' } });
      return { error: 'unsupported_approved_content' as const };
    }

    await appendAuditEvent(q, {
      orgId: session.orgId,
      actor: { userId: session.userId, role: session.role },
      action: 'studio.exported',
      entityKind: 'studio_artifact',
      entityId: artifactId,
      outcome: 'success',
      metadata: {
        format,
        artifact_kind: artifact.artifactKind,
        snapshot_sha256: artifact.snapshotSha256,
      },
    });

    if (format === 'abdm' || format === 'mcode') {
      const patient = await getPatient(q, artifact.patientId);
      const timeline = await getTimeline(q, artifact.patientId);
      const citedSet = new Set(artifact.citedFactIds);
      const scopedFacts = timeline.filter(
        (t) =>
          (t.state === 'verified' || t.state === 'corrected') &&
          citedSet.has(t.evidenceFactId),
      );
      const domainFacts: FactWithProvenance[] = scopedFacts.map((f) => ({
        id: f.evidenceFactId,
        patientId: artifact.patientId,
        documentId: f.documentId,
        factType: f.factType as FactWithProvenance['factType'],
        value: { kind: 'text' as const, text: f.valueText },
        verbatimQuote: f.verbatimQuote,
        pageNumber: f.pageNumber ?? 1,
        state: 'verified' as const,
      }));

      const patientDisplayName = artifact.isDeidentified
        ? 'De-Identified Patient'
        : (patient?.displayName ?? 'Patient');

      if (format === 'abdm') {
        const bundle = exportToAbdmDocumentBundle(domainFacts, {
          profileType: 'OPConsultRecord',
          patientId: artifact.patientId,
          patientName: patientDisplayName,
          facilityName: 'Regional Cancer Institute',
        });
        return { bundle, format: 'abdm' as const };
      } else {
        const bundle = exportToMCodeBundle(domainFacts, {
          patientId: artifact.patientId,
          patientName: patientDisplayName,
          facilityName: 'Regional Cancer Institute',
        });
        return { bundle, format: 'mcode' as const };
      }
    }

    return { artifact, format: (format === 'json' ? 'json' : 'markdown') as 'json' | 'markdown' };
  });

  if (!result) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });
  if ('error' in result) {
    if (result.error === 'deidentified_fhir_not_supported' || result.error === 'snapshot_integrity_failed' || result.error === 'unsupported_approved_content') {
      return NextResponse.json({ error: { code: result.error,
        message: result.error === 'unsupported_approved_content'
          ? 'Export blocked: regenerate this document from its source evidence and obtain clinician approval.'
          : result.error === 'deidentified_fhir_not_supported'
          ? 'De-identified artifacts support reviewed Markdown and JSON only; FHIR would disclose underlying identifiers or source text.'
          : 'Export blocked: the approved snapshot hash does not match the document.' } }, { status: 409 });
    }
    if (result.error === 'source_withdrawn') {
      return NextResponse.json(
        {
          error: {
            code: 'source_withdrawn_or_unavailable',
            message: 'Export blocked: one or more cited source documents have been withdrawn or unverified.',
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'artifact_not_approved', message: 'Only an approved studio artifact may be exported.' } },
      { status: 409 },
    );
  }

  if (result.format === 'abdm') {
    return new NextResponse(JSON.stringify(result.bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Content-Disposition': `attachment; filename="studio-${artifactId}-abdm.json"`,
      },
    });
  }

  if (result.format === 'mcode') {
    return new NextResponse(JSON.stringify(result.bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Content-Disposition': `attachment; filename="studio-${artifactId}-mcode.json"`,
      },
    });
  }

  if (result.format === 'json') {
    const artifact = result.artifact;
    return NextResponse.json(artifact.isDeidentified ? {
      artifactKind: artifact.artifactKind, title: 'De-Identified Academic Case Report Draft',
      markdownBody: artifact.markdownBody, isDeidentified: true, status: artifact.status,
      snapshotSha256: artifact.snapshotSha256,
    } : artifact);
  }

  // Default: markdown
  return new NextResponse(result.artifact.markdownBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.artifact.isDeidentified ? 'deidentified-case-report' : result.artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md"`,
    },
  });
}
