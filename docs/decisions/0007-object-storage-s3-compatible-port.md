# 0007 — Document blobs in S3-compatible object storage

**Status:** Accepted
**Date:** 2026-09-22

## Context

The system ingests PDFs, scans and photographs, renders every page to an image
for the source viewer, and retains raw per-page OCR JSON for reproducibility. A
single 40-page scanned discharge summary produces the original file, 40 page
renders, 40 thumbnails and 40 OCR JSON files.

`CLAUDE.md` requires encryption at rest where supported, explicit document
scope and audit logging. The demo must run offline on a laptop, and the same
code should work against a cloud store later without a rewrite.

## Decision

Blobs live in an **S3-compatible object store** — MinIO locally, in Docker
Compose. Postgres stores metadata and `storage_key` only.

```
Bucket: oncobrief-documents   (private, no public policy, versioning on)
  org/{org_id}/patient/{patient_id}/doc/{document_id}/
      original.{ext}          immutable source bytes
      page/{n}.webp           rendered page for the viewer
      page/{n}.thumb.webp     thumbnail
      ocr/{n}.json            raw OCR output, retained
```

Access rules, without exception:

- Private bucket, no public ACL, ever.
- Reads are **60-second presigned GETs**, issued only after the Layer-2 policy
  check *and* an assertion that the key's `org_id` prefix matches the session's
  `org_id`. A swapped identifier cannot produce a valid signature.
- Every presign writes an `audit_event` (`document.page_viewed` /
  `document.downloaded`). In a healthcare system, *who looked at which page* is
  itself auditable.
- The client never constructs a storage path.
- Uploads go **through the application**: size cap, page-count cap, extension
  allow-list, MIME sniffing via magic bytes rather than the client-supplied
  header, and `content_sha256` computed server-side.
- At rest: MinIO SSE-S3 with a locally generated key for the prototype; KMS on
  S3/R2 later.

A narrow `StoragePort` interface (`put`, `getStream`, `presignGet`, `delete`)
is the only way the application touches storage. `delete` is used solely by
`pnpm demo:reset`.

## Alternatives considered

**Blobs in Postgres (`bytea` or large objects).** Rejected: bloats the database
and every backup, degrades the ledger's working set, and makes streaming a page
render needlessly expensive.

**Local filesystem volume.** Rejected: simpler for the demo but the access
pattern would differ from any cloud deployment, so the security model
(presigning, key-prefix assertion) could not be exercised or tested. The thing
most worth demonstrating would be the thing not built.

**Client-side direct-to-bucket upload with a presigned PUT.** Rejected: moves
MIME sniffing, size capping and server-side hashing to a place they cannot be
trusted. `content_sha256` must be computed by the server for the duplicate
constraint to mean anything.

**Public bucket with unguessable keys.** Rejected outright. Security by URL
obscurity, no audit of access, no revocation.

**Long-lived presigned URLs (hours).** Rejected: a URL pasted into a chat or
left in browser history becomes a durable PHI leak. 60 seconds is enough to
load an image.

## Consequences

**Positive.** Postgres stays small and fast. The storage interface is identical
locally and in cloud, so the port needs no change on deployment. Threat T2
(unauthorised document retrieval) is mitigated by construction: private bucket,
short TTL, authz-then-audit-then-sign. Retained raw OCR JSON allows re-running
extraction and diffing extractor versions, which matters because provenance is
the product claim.

**Negative.** A second stateful service to run and reset. Blobs and rows can
diverge — an orphaned object after a failed ingest, or a `storage_key` pointing
at nothing. A reconciliation job is needed eventually and is not in scope for
this window. Presigning on every page view adds a round trip and an audit write.

**Neutral.** MinIO's SSE-S3 key is local and unmanaged in the prototype. Real
key management is a pilot prerequisite, listed among the honest gaps in
architecture §24 rather than described as present.
