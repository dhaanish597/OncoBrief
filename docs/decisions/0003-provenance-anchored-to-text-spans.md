# 0003 — Provenance anchored to OCR text spans

**Status:** Accepted
**Date:** 2026-09-22

## Context

`CLAUDE.md` requires every displayed fact to trace to a source document, page,
text span, document version, extraction method, confidence, reviewer state and
reviewer identity. The design document §7 lists the same fields. The defining
interaction is *fact → source → exact source text*.

There is a cheap way to fake this: store the fact and the quote, then re-search
the document text at render time to place a highlight. It usually looks
correct. It is not provenance — the highlight is recomputed from the value
rather than recorded at extraction time, so it can drift, land on the wrong
occurrence, or silently find nothing.

## Decision

The **text span is the provenance atom**, persisted at ingestion time.

`text_span` stores, per OCR unit: document, page, reading-order index, text,
character offsets into the page's plain text, a bounding box **normalised to
0..1 of page dimensions**, per-span OCR confidence, and which engine and
version produced it. Spans carry a `granularity` of `word`, `line` or `block`
and may reference a parent span.

`evidence_span_link` is many-to-many with an `ordinal`, so one fact can cite a
multi-word quote as an ordered span range.

**Verbatim-span validation gates every ledger write.** Before an
`evidence_fact` may be inserted:

1. Concatenate linked spans' text in `ordinal` order.
2. Normalise both sides identically — Unicode NFKC, collapse internal
   whitespace, unify hyphen/dash variants, trim.
3. Assert the normalised `verbatim_quote` is a **contiguous substring** of the
   normalised concatenation.
4. Assert every linked span belongs to `document_id` and to a single page.

Failures are written to `extraction_candidate` with
`rejected_reason = 'span_mismatch'` and never reach the ledger.

Raw per-page OCR JSON is retained in object storage.

## Alternatives considered

**Store the quote only; re-search at render time.** Rejected: the highlight is
derived from the value rather than recorded, so it can point at the wrong
occurrence of a repeated string or fail silently. It also cannot detect a
fabricated value — the thing this design most needs to detect.

**Character offsets into a whole-document text blob, no geometry.** Rejected:
cannot draw a box on a rendered page, so the core interaction is impossible for
scanned documents.

**Page-level provenance only.** Rejected: "it's somewhere on page 4 of a dense
pathology report" does not let a clinician confirm a fact in seconds, which is
the entire value proposition.

**Absolute pixel coordinates.** Rejected: breaks under zoom, device pixel ratio
and re-rendering at a different DPI. Normalised coordinates survive all three.

## Consequences

**Positive.** Highlights are real recorded geometry, not a render-time guess.
Hallucinated values are **structurally unable to become evidence** — a
fabricated quote has no substring anchor, so it is rejected mechanically
without needing to detect that the extractor was wrong. Per-span
`ocr_engine` and `ocr_confidence` let the UI distinguish "this came from the
PDF's own text layer" from "this came from OCR at 0.71 confidence", which a
provenance product must not hide. Retained raw OCR allows re-running extraction
and diffing extractor versions.

**Negative.** `text_span` is the largest table in the system — word granularity
on a 40-page scan is tens of thousands of rows. Ingestion is slower and more
storage-hungry. Normalisation rules must be identical on both sides of the
comparison or valid facts get rejected; those rules need their own test battery.

**Neutral.** The substring check assumes the value's supporting text appears
contiguously. Facts requiring assembly from separated text (a date in a header
plus a procedure in a body paragraph) must be modelled as multiple facts or
cite the enclosing block span. This constraint is acceptable and arguably
desirable: it discourages synthesising composite claims.
