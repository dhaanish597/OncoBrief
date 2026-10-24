---
name: oncobrief-evidence-traceability
description: >-
  Use this skill when handling OCR-extracted values, evidence ledger provenance,
  source document and page linking, verification workflows, observation histories,
  reference intervals, and maintaining the strict non-clinical boundary in OncoBrief.
---

# OncoBrief Evidence Traceability

This skill defines the contracts, data flows, and verification workflows that maintain end-to-end evidence traceability in OncoBrief.

The central abstraction in OncoBrief is the **Evidence Ledger**. Every fact, test result, milestone, and baseline parameter displayed in the interface must be an auditable view over this ledger, anchored by exact OCR text spans to primary source documents.

---

## 1. Core Rule & Grounding Requirements

1. **The Ledger is the Source of Truth**:
   - The timeline and clinical cards are **views** over the Evidence Ledger.
   - No fact may be displayed without complete provenance metadata.
   - Facts must never be invented, inferred, or hallucinated.
2. **Span-Anchored Provenance**:
   - Every extracted value carries a `verbatimQuote` which must match a contiguous substring in the OCR text layer.
   - A candidate extraction that fails span validation is rejected and never reaches the ledger.
3. **Auditability & Append-Only State**:
   - The ledger is append-only. Corrections do not overwrite existing entries; they create a new record that references and supersedes or resolves the preceding fact.
   - Every state transition records actor, timestamp, action, and rationale.

---

## 2. Evidence Data Model (`StructuredObservation`)

All clinical observations extracted from documents adhere to the `StructuredObservation` schema defined in `packages/domain/src/clinical/observation-types.ts`:

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique ledger fact identifier |
| `patientId` | `string` | Patient UUID |
| `documentId` | `string` | Source document UUID |
| `documentName` | `string` | Original file name (e.g. `DEMO-001-CBC.pdf`) |
| `pageNumber` | `number \| null` | 1-based page number where observation was found |
| `observedOn` | `string \| null` | ISO date when sample/observation was taken |
| `documentDate` | `string \| null` | Date of the source document itself |
| `canonicalKey` | `string` | Normalized analyte identifier (e.g. `haemoglobin`) |
| `canonicalLabel` | `string` | Standardized display name |
| `asWrittenName` | `string` | Verbatim analyte name as printed on the report |
| `verbatimQuote` | `string` | Exact text span extracted from report OCR |
| `valueText` | `string` | Verbatim result string (e.g. `11.2`) |
| `numericValue` | `number \| undefined` | Parsed floating-point value for charting |
| `unitText` | `string \| undefined` | Verbatim unit of measure (e.g. `g/dL`) |
| `referenceRange`| `SourceReferenceRange \| undefined` | Low, high, and verbatim range text |
| `flag` | `ObservationSourceFlag \| undefined` | Source-reported abnormality (`H`, `L`, `CRITICAL`, `NORMAL`) |
| `state` | `EvidenceState` | `extracted`, `verified`, `conflicting`, `corrected`, `rejected`, `superseded` |
| `extractorName` | `string \| undefined` | Ingestion extractor (`rule-based` or `bedrock`) |
| `reviewerName` | `string \| null` | Identity of clinician or coordinator who verified fact |
| `reviewedAt` | `string \| null` | Timestamp of human verification |

---

## 3. Source Navigation Contract

Every displayed observation in any card, table, or chart must provide a direct navigation link to its supporting document in the Source Inspector:

```tsx
<Link
  href={`/patients/${patientId}/sources/${obs.documentId}?fact=${obs.id}${obs.pageNumber ? `&page=${obs.pageNumber}` : ''}`}
  className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
  title={obs.documentName}
>
  {obs.documentName}{obs.pageNumber ? ` · p${obs.pageNumber}` : ''}
</Link>
```

When clicked, the route loads the document viewer, navigates to `pageNumber`, and highlights the bounding box corresponding to `obs.id`.

---

## 4. Verification & Conflict Handling

1. **Human Verification**:
   - Only humans can verify facts (`extracted` → `verified`).
   - The UI must render the appropriate `StateBadge` next to each observation.
2. **Never Silently Resolve Contradictions**:
   - If two documents present conflicting values for the same event or baseline metric, both values are stored and marked `conflicting`.
   - Both values must be presented to the user with their respective source documents until a human reconciles them.
3. **Preserving Historical Records**:
   - An updated lab test or vitals reading does not delete past values. The system maintains full longitudinal history so trends over time remain unbroken.

---

## 5. Preservation of Data Flows & Schemas

When working on features touching clinical data:
- **Do NOT** alter database triggers or RLS policies in `packages/db/migrations/`.
- **Do NOT** bypass `getPatientClinicalSummary` in `packages/db/src/services/documents.ts`.
- **Preserve** `can(role, 'patient:read')` and RBAC checks across all API routes and server actions.
- Maintain the non-clinical boundary guard in `packages/domain/src/policy/clinical-boundary.ts`.

---

## 6. Implementation Workflow

1. **Inspect Codebase**: Verify query patterns in `packages/db` and domain logic in `packages/domain`.
2. **Make Minimal Scoped Changes**: Only extend data models or views if necessary; reuse `StructuredObservation`.
3. **Verify Provenance Integrity**: Ensure any new UI component renders `documentName`, `pageNumber`, and `StateBadge`.
4. **Execute Verification**:
   ```bash
   pnpm --filter @oncobrief/domain test
   pnpm --filter @oncobrief/db test
   pnpm boundary:check
   ```
5. **Report Changed Files**: Document all affected files and queries.

For detailed provenance link contracts and database service signatures, see [references/provenance-contracts.md](./references/provenance-contracts.md).
