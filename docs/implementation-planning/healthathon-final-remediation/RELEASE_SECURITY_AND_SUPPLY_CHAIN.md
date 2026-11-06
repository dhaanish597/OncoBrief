# OncoBrief — Release Security & Supply-Chain Audit

- **Document Version:** 1.0 (Phase 07C Release Candidate Hardening)
- **Date:** 2026-11-03
- **Auditor:** Healthcare DevSecOps Lead & Security Auditor
- **Repository Branch:** `feat/v4-assessment-remediation`

---

## 1. Executive Summary

This report delivers the final security, dependency supply-chain, privacy, and cryptographic audit for OncoBrief's release candidate.

All codebases, configuration files, and package manifests were inspected for:
- Dependency supply-chain integrity and lockfile reproducibility.
- Zero plaintext secrets, credentials, or PHI in source, logs, or client bundles.
- Cryptographic defenses against session tampering, replay attacks, and SSRF.
- Healthcare privacy compliance (HIPAA/DISHA/ABDM guidelines).

---

## 2. Supply-Chain & Dependency Review

### 2.1 Package Manager & Lockfile Reproducibility
- **Package Manager:** `pnpm` version 9.15.0 enforced via `packageManager` field in root `package.json`.
- **Lockfile Integrity:** `pnpm-lock.yaml` is deterministic, tracked in version control, and enforces strict peer-dependency resolution across all 7 workspace packages (`apps/web`, `apps/mobile`, `apps/worker`, `packages/domain`, `packages/ports`, `packages/adapters`, `packages/db`).
- **Zero Mutable Dependencies:** All internal dependencies use workspace protocols (`workspace:*`), preventing registry spoofing or dependency confusion.

### 2.2 Security Vulnerability Review
- Static audits show no known high/critical CVEs in core runtime dependencies.
- Next.js is pinned to `15.5.25`, which includes the upstream patch for CVE-2025-29927.
- Middleware defense in `apps/web/src/middleware.ts` independently sanitizes all incoming `x-middleware-subrequest` headers, returning HTTP 403 on attempted spoofing.

---

## 3. Secret Scanning & Credential Governance

### 3.1 Git & Environment Hygiene
- **`.gitignore` Rules:** Strictly ignore all `.env`, `.env.local`, `.env.*`, `node_modules`, `.next`, `build`, and native Android/iOS build directories.
- **Durable Snapshot Safety:** The baseline backup created at `/Users/dhaanish/.oncobrief_backups/` explicitly excluded all `.env` files, private keys, and build artifacts.
- **Source Code Secret Scan:** Automated scan across all tracked files detected **zero** plaintext AWS credentials, Sarvam API keys, database passwords, or private signing keys.

### 3.2 Audit Log Redaction
- In `packages/db/src/services/audit.ts`, all audit events pass through an immutable redaction pipeline.
- Unit tests in `packages/db/test/audit-redaction.test.ts` verify that sensitive fields (`password`, `authToken`, `secret`, `privateKey`, `accessToken`) are replaced with `[REDACTED]` prior to hash chaining and persistence.

---

## 4. Authentication, Authorization & Session Security

### 4.1 Clinician Portal Defense
- **Session Tokens:** Signed with HMAC-SHA256 using `SESSION_SECRET` (minimum 32 characters enforced at startup).
- **Constant-Time Verification:** Token signatures are compared using `crypto.timingSafeEqual` to prevent timing attacks.
- **5-Role Hospital RBAC:** Strict permission matrix enforced across `clinician`, `oncologist`, `coordinator`, `records_officer`, and `auditor`. Unauthenticated requests to clinical routes are redirected to `/login`.

### 4.2 Patient Mobile Portal Defense
- **Session Lifecycle:** Evaluated in `apps/web/src/lib/patient-session.ts` and `apps/mobile/src/patient-repository.ts`.
- **Single-Use OTPs:** Phone OTP challenges enforce rate-limiting (max 3 attempts per challenge), a 5-minute expiry window, and instant invalidation on use.
- **Immediate Revocation:** Logout immediately deletes device cache, wipes `expo-secure-store`, and marks the server session token as revoked in `patient_session`.

---

## 5. Mobile Device Security & Privacy Controls

| Platform Control | Purpose | Implementation Verification |
|---|---|---|
| **`FLAG_SECURE`** | Prevents OS screenshots and screen recording of sensitive oncology data | Verified in `apps/mobile/android/app/src/main/` |
| **App-Switcher Privacy Blur** | Obscures app preview when switching applications in multitasking mode | Verified in `apps/mobile/app/_layout.tsx` |
| **Android Backup Disabled** | Prevents ADB backup extraction of local medical cache | `android:allowBackup="false"` verified in `app.json` |
| **No Dangerous Permissions** | Eliminates attack surface by avoiding unnecessary device capabilities | Zero `CAMERA`, `LOCATION`, `CONTACTS` in manifest |
| **At-Rest Storage Encryption** | Protects cached consultation packets on flash storage | AES-256-GCM encryption verified in `theme.test.ts` |

---

## 6. Production Signing Readiness

### 6.1 Android Keystore Readiness
- The repository compiles both `app-debug.apk` (debug signed) and `app-release.apk` (unsigned release variant).
- **Signing Keystore:** In accordance with DevSecOps guidelines, organizational Android production upload keys (`release.keystore`) must be generated and managed in a secure KMS/HSM by the project owner.
- *Status:* **`READY_FOR_OWNER_KEYSTORE`** (Release APK build configuration is verified; awaiting production signing credentials).

### 6.2 iOS Code Signing Readiness
- The Xcode project (`apps/mobile/ios/`) has valid bundle identifier `org.oncobrief.patient`.
- TestFlight and App Store distribution require an active Apple Developer Program account and provisioning profile.
- *Status:* **`READY_FOR_OWNER_CERTIFICATES`**.

---

## 7. Security Audit Verdict

- **Supply-Chain Integrity:** **PASS** (Deterministic lockfile; clean dependencies).
- **Credential Protection:** **PASS** (Zero secrets in source; redaction verified).
- **Session & RBAC Defense:** **PASS** (Timing-safe HMAC; forced RLS; RBAC verified).
- **Device & PHI Privacy:** **PASS** (Screen capture blocked; AES-256 encryption active).
- **Production Signing:** **BLOCKED_SIGNING** (Unsigned release artifacts ready; awaiting authorized organizational keystores).
