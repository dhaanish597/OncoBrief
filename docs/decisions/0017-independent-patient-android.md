# ADR 0017: Independent patient Android companion

Date: 2026-10-28

The patient request explicitly authorizes autonomous implementation of a new mobile app while preserving the clinician website. Existing uncommitted patient HTTP routes accept client-selected identities, use the migrator pool, and fall back to database patients. They have not passed a patient authorization review and must not be used by this app.

Build `apps/mobile` with Expo, React Native, TypeScript and Expo Router. Use a typed, versioned, local synthetic repository with no network API calls. Display demo status throughout. Native demo state is stored in the application's private directory; web preview is session-memory only. Neither is approved for real health records. Imports require an explicit synthetic-files acknowledgement. No production authentication, real sharing, OCR, AI, notifications or clinical interpretation is claimed.

Alternatives: reusing the patient web frontend violates the independent-native request; connecting the existing mobile endpoints would expose data through unverified authorization. Defer that connection behind a fail-closed gateway contract. Production requires a separately reviewed patient session, document ownership enforcement, encrypted document store, revocation and audit persistence.

Patient review never becomes clinician verification. Timeline is a projection over the local synthetic evidence ledger. Contradictions preserve both source values. Consequential demo operations require explicit confirmation. Sharing previews record simulation only; packet export describes selected synthetic content before confirmation. No automated medical interpretation or inferred requirements.

Consequence: fully interactive offline demonstration without hospital access. Real patient deployment remains blocked. Existing clinician flow and uncommitted files remain untouched.
