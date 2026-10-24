# 0021 — Configured OCR with real page integrity and explicit failure

Status: Accepted. Date: 2026-10-23.

## Context and decision

Phase 1 fixes upload paths that hardcoded local adapters, PDF batches that
replaced actual page streams with synthetic markers, and image metadata that
masqueraded as extracted text. The shared factory selects an explicitly
configured driver, or Sarvam then configured Textract then local in auto mode.
An explicitly selected provider with missing configuration fails clearly.

`OcrPort` gains an optional document-level capability; existing page/fixture
contracts remain supported. The document capability avoids submitting an entire
PDF repeatedly for every page. `pdf-lib` 1.17.1 is the one added runtime library:
a deterministic in-process PDF parser/copier needed for real page trees,
compressed PDFs, page counting and content-preserving batches. No new service
or infrastructure is added. It is not used to interpret report content.

Sarvam uses the official job API, genuine <=10-page PDF batches, bounded
polling and restart-safe provider job identifiers. Input/configuration controls
language. Source block geometry and reading order are retained; absent/invalid
geometry fails rather than inventing coordinates. TIFF/WebP conversion is
explicitly unsupported until a real codec is configured; replacing a signature
is not conversion.

Textract retains the existing async S3 path. Direct images and real individual
PDF pages can use AnalyzeDocument. Local processing reads existing PDF text
and structured FHIR/DICOM headers; it does not claim optical recognition of
raster images. Unsupported scans require manual transcription.

Provider failures persist a safe failure code and audit event. Empty results
quarantine; worker partial results fail instead of being promoted as complete.
Fixtures remain synthetic and deterministic. No result verifies evidence.

## Alternatives and security assumptions

- Signature substitution and synthetic batches: corrupt source evidence.
- New vendor/CLI rendering infrastructure: unnecessary for this phase.
- Pretend OCR success offline: violates provenance and hides missing records.

Configured provider endpoints and credentials are operator-controlled. No
credentials or provider response bodies are logged. OCR providers receive
sensitive source bytes only when configured; institution authorization, vendor
data-processing terms and deployment egress policy remain operator obligations.
Live providers are not acceptance-verified by the local suite. Mock transport
checks exercise the documented protocol, real PDF bytes and source geometry.

Official protocol references checked 2026-10-23:
- [Sarvam document intelligence](https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview)
- [Sarvam results](https://docs.sarvam.ai/api-reference/doc-ai/job/results)
- [Textract synchronous operations](https://docs.aws.amazon.com/textract/latest/dg/sync.html)
