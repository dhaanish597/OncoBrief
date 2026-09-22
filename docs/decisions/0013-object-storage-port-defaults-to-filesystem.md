# 0013 — Object storage port defaults to the local filesystem

**Status:** Accepted
**Date:** 2026-09-22

## Context

Architecture §15 and ADR 0007 specify MinIO (S3 API) as the local object store.
The judging-day requirement is `docker compose up` on a laptop with limited free
disk, and the storage layer is already behind `StoragePort`, so the concrete
backend is an implementation detail rather than an architectural commitment.

## Decision

`StoragePort` ships two adapters:

- `LocalFsStorageAdapter` — the default (`STORAGE_DRIVER=fs`). Blobs are written
  under `STORAGE_FS_ROOT` with the same tenant-prefixed key layout, and
  presigned GETs are replaced by short-lived, HMAC-signed application URLs that
  the app validates before streaming.
- `S3StorageAdapter` — any S3-compatible store, including MinIO and Cloudflare
  R2. Selected with `STORAGE_DRIVER=s3`.

Both enforce the same rules: private access only, no client-constructed paths,
`org_id` key-prefix assertion before signing, and an `audit_event` per issuance.

## Alternatives considered

1. **MinIO only.** Keeps one code path but adds a container, an image pull and
   ~200 MB of disk to every run, and makes `docker compose up postgres` an
   incomplete setup.
2. **Postgres large objects.** Rejected — the architecture explicitly keeps
   blobs out of the database.

## Consequences

- The demo runs with only Postgres.
- `LocalFsStorageAdapter` is not a production storage story: it has no
  at-rest encryption, no replication and no lifecycle policy. `S3StorageAdapter`
  is the pilot path.
- Presigned-URL semantics differ between adapters. The route that serves a page
  render is adapter-agnostic; tests assert the audit event and the tenant-prefix
  check, which are the properties that matter.
