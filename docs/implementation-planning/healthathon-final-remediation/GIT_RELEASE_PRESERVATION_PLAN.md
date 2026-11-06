# OncoBrief — Git Release Preservation & Staged Commit Plan

- **Document Version:** 1.0 (Phase 07C Release Candidate Hardening)
- **Date:** 2026-11-03
- **Auditor:** Principal Release Engineering Lead
- **Branch:** `feat/v4-assessment-remediation`
- **Committed Base HEAD:** `7b2edec145a9efe88f7f3928e6de975743ce33ca`

---

## 1. Safety Directives & Working-Tree Inventory

In strict accordance with project safety rules:
- **Zero destructive git commands were executed (`git reset --hard`, `git clean -fd`, `git checkout -- .`, `git restore .`).**
- **Zero uncommitted work has been discarded, overwritten, or modified destructively.**
- **No commits, merges, rebases, or pushes have been executed without explicit human authorization.**

### Working-Tree Snapshot Inventory
- **Tracked Modifications:** 87 modified files across `apps/web/`, `packages/db/`, `packages/domain/`, `packages/adapters/`, `package.json`, and `pnpm-lock.yaml`.
- **Untracked Paths:** 58 untracked items across:
  - `apps/mobile/` (Complete integrated Expo/React Native cross-platform application).
  - `apps/extension/` (Browser extension for external diagnostic capture).
  - `packages/db/migrations/0020` through `0023` (PostgreSQL RLS, Patient Portal, and FHIR interoperability).
  - `docs/implementation-planning/healthathon-final-remediation/` (Authoritative audit and verification documentation).
  - `tools/` (Release gates, boundary linters, branding validators).

---

## 2. Durable Local Recovery Snapshot

Before executing any Phase 07C modifications, a durable, standalone tarball snapshot was created outside the repository to ensure complete disaster recovery:

- **Storage Location:** `/Users/dhaanish/.oncobrief_backups/oncobrief-phase07c-baseline-20261103224235.tar.gz`
- **Archive Size:** 612 MB
- **SHA-256 Checksum:** `aed42ef591a721503571a99088d55fc4f0a2f7c824bb1f2338f8f1c727a8e2e5`
- **Integrity Verification:** Tested via `tar -tzf ... | grep "packages/domain/src/index.ts"` (Exit code 0).
- **Security Exclusions:** Strictly excluded all `.env`, `.env.*`, private keys, credentials, `node_modules`, `.next`, `.git`, `.turbo`, and native build directories (`apps/mobile/android/.gradle`, `app/build`, `ios/Pods`).

### Disaster Recovery Procedure
If the development workstation experiences hardware or git index corruption:
```bash
# In an empty recovery directory:
mkdir -p ~/recovery/oncobrief && cd ~/recovery/oncobrief
tar -xzf /Users/dhaanish/.oncobrief_backups/oncobrief-phase07c-baseline-20261103224235.tar.gz -C .
pnpm install --frozen-lockfile
pnpm -r --no-bail typecheck
pnpm test
```

---

## 3. Proposed Staged Commit Sequence (Awaiting User Approval)

The extensive uncommitted engineering work should be preserved cleanly in logical, reviewable atomic commits rather than a single monolithic dump.

The following commit plan is proposed for human authorization:

### Proposed Commit 1: Core Foundation, DB Migrations & Multi-Tenant RLS
```bash
git add packages/db/ migrations/ packages/ports/ packages/domain/
git commit -m "feat(core): implement migrations 0020-0023, multi-tenant RLS, and domain models"
```

### Proposed Commit 2: Sarvam AI Multimodal & External Adapters
```bash
git add packages/adapters/ tools/check-clinical-boundary.ts tools/validate-branding.ts
git commit -m "feat(adapters): integrate Sarvam Vision OCR, Saaras STT, Bulbul TTS, and Mayura translation"
```

### Proposed Commit 3: Web Application Features & Playwright E2E Suites
```bash
git add apps/web/
git commit -m "feat(web): consultation workspace, longitudinal charts, reconciliation room, and E2E suites"
```

### Proposed Commit 4: Patient Mobile Application (Android + iOS)
```bash
git add apps/mobile/ tools/verify-*.sh
git commit -m "feat(mobile): integrated cross-platform patient mobile portal with Hermes bytecode"
```

### Proposed Commit 5: Interoperability Security Hardening & TDD Fixes
```bash
git add packages/db/test/fhir-rls-security.test.ts packages/adapters/test/fhir-client.test.ts
git commit -m "fix(security): harden PostgreSQL RLS session variables and FHIR client SSRF defenses (PH07C-REG-001..003)"
```

### Proposed Commit 6: Health-a-thon Remediation Documentation & Runbooks
```bash
git add docs/
git commit -m "docs(release): Health-a-thon 2026 final release candidate audit, runbooks, and verification evidence"
```

> [!IMPORTANT]
> **Action Required:** In accordance with safety rules, these commits will NOT be created automatically. The user may review this sequence and grant explicit authorization to proceed with committing.
