# OncoBrief — API

Two entry points share one implementation of every rule: `/api/v1` route
handlers (the stable contract) and Next.js Server Actions (in-app forms only).
Both run under a tenant transaction and both check permissions server-side.

## Authentication

- `AUTH_MODE=session` (default): opaque `ob_session` HttpOnly cookie.
- `AUTH_MODE=cognito`: `Authorization: Bearer <jwt>`; the token is verified
  against the user pool JWKS and then cross-checked against membership.

Errors use a stable shape `{ "error": { "code": "..." } }`. Cross-tenant reads
return **404**, never 403.

## Endpoints in this repository

### Authentication
- `POST /login` (server action) — session auth.

### Ingestion (Phase 2)
`POST /api/v1/patients/{patient_id}/documents/upload-url`

Request:

```json
{ "filename": "pathology.pdf", "mimeType": "application/pdf",
  "byteSize": 483210, "documentDate": "2026-01-05", "issuingFacility": "TMC" }
```

Response `201`:

```json
{ "document_id": "uuid",
  "presigned_url": "https://…X-Amz-Signature=…",
  "s3_key": "org/{org}/patient/{patient}/doc/{id}/original.pdf",
  "expiration": "2026-01-05T12:15:00.000Z",
  "required_headers": { "content-type": "application/pdf" },
  "correlation_id": "up:uuid" }
```

Requires `document:upload`. Returns `501` when `STORAGE_DRIVER` is not S3,
`413` above 25 MB, `415` for a disallowed MIME type. Uploading through the app
remains available as the existing server action; this endpoint is the
direct-to-S3 path.

### Source verification (Phase 7)
`GET /api/v1/evidence/{event_id}`

Returns the fact, state, value, confidence band, extractor identity, correction
lineage, the verbatim quote, page number, normalized bounding boxes, document
version and SHA-256, a 60-second presigned URL for the original, the page
geometry URL, and the full ledger history. Every call writes a
`document.page_viewed` audit event.

### Documents and pages (existing)
- `GET|POST /api/v1/patients/{id}/documents/{documentId}/pages/{n}`
- `GET /api/v1/packets/{packetId}/export`

### Assistant (existing, unrelated to the ledger)
- `POST /api/v1/assistant/chat`, conversations, voice STT/TTS.

## Server actions (existing) — the full mutation surface

`verify/correct/reject/reinstate` evidence, `resolve` conflict, create/assign/
status/comment task, waive gap, refresh readiness, confirm document type, upload
document, create/submit/approve/withdraw packet, compose/approve/deliver message.
Each enforces the RBAC matrix (`packages/domain/src/policy/rbac.ts`) and writes
an audit event.

## Conventions

- Mutating endpoints are `POST /{resource}/{id}/{action}`: the action *is* the
  domain event and matches the ledger vocabulary.
- Idempotency: `idempotency_key` exists in the schema; the upload-url path is
  naturally idempotent per presigned object because the worker keys on
  `document_id`.
- Evidence state transitions are rejected before any write with
  `409 invalid_transition` and the guard code.

## Not implemented here

The reference brief lists a broader surface (readiness, timeline, gaps, audit,
ledger verify as HTTP routes). Those capabilities exist as **service functions
and server actions** today; only the endpoints above are exposed as route
handlers. Promoting the rest to `/api/v1` is mechanical and tracked as a gap.
