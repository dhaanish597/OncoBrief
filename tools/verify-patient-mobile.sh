#!/usr/bin/env bash
set -euo pipefail

# OncoBrief Patient Mobile - MOB-024 Monorepo Verification & Release Gate Script
# Governed by: PATIENT_MOBILE_RELEASE_GATES.md & REQ-MOB-045

echo "================================================================="
echo "  ONCOBRIEF MOB-024: PATIENT MOBILE MONOREPO VERIFICATION GATE"
echo "================================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Workspace root: ${REPO_ROOT}"
cd "${REPO_ROOT}"

# Stage 1: TypeScript typecheck across all monorepo packages
echo ""
echo "[+] Step 1/6: Running monorepo typecheck..."
pnpm typecheck

# Stage 2: Clinical boundary & branding policy scans
echo ""
echo "[+] Step 2/6: Running clinical boundary and branding policy checks..."
pnpm boundary:check
pnpm branding:check

# Stage 3: Mobile client unit, selector, and domain tests
echo ""
echo "[+] Step 3/6: Running mobile unit tests (119 specs)..."
pnpm --filter @oncobrief/mobile test

# Stage 4: Patient portal backend API & canonical security-negative suite
echo ""
echo "[+] Step 4/6: Running patient portal backend and security-negative tests (84 specs)..."
pnpm --filter @oncobrief/web test -- src/app/api/v1/patient-portal --fileParallelism=false

# Stage 5: Android Hermes bytecode bundle compilation
echo ""
echo "[+] Step 5/6: Verifying Android Hermes bytecode bundle export..."
pnpm --filter @oncobrief/mobile export:android

# Stage 6: Database/RLS integration verification
echo ""
echo "[+] Step 6/6: Verifying database RLS patient portal foundation..."
pnpm --filter @oncobrief/db test test/patient-portal-rls.test.ts

echo ""
echo "================================================================="
echo "  RELEASE GATE PASS: ALL PATIENT MOBILE VERIFICATIONS GREEN (0)"
echo "================================================================="
exit 0
