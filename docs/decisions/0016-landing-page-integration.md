# 0016 — Landing page integrated as a scoped public surface

**Date:** 2026-10-03
**Status:** Accepted

## Context

A landing page for OncoBrief was designed externally and delivered as a
standalone Next.js 16 application (`onco-brief-landing-page-redesign.zip`). It
ships its own design tokens, its own fonts, its own root layout, its own
dependency set and its own fictional fixtures.

`apps/web` is a Next.js 15 application whose evidence workspace is verified
against the deployed environment. The two had to be reconciled.

The forcing questions were: does the landing's visual language replace the
product's, and how do two Tailwind stylesheets coexist in one document?

## Decision

**The landing becomes the public surface at `/`; the workspace keeps its
existing appearance.**

1. `/` renders the landing for everyone. Signed-in users are not redirected.
   The primary CTA is a static link to `/workspace`; the workspace's existing
   session guard forwards an anonymous visitor to `/login`. The landing
   therefore reads no session and stays statically prerenderable.
2. The landing's visual language is **scoped to the landing**. It shares the
   application's single Tailwind build; only *new* tokens are added to `@theme`.
   Colliding tokens (`--font-mono`, `--font-serif`, `--color-ink-soft`) keep the
   workspace's value, and the landing's intent is restored inside a `.landing`
   wrapper by scoped rules whose specificity beats the global utility.
3. The landing's global element resets are scoped to `.landing` rather than
   applied to the document.
4. Four dependencies are added (`motion`, `lucide-react`, `clsx`,
   `tailwind-merge`); five are dropped as unused (`@base-ui/react`,
   `class-variance-authority`, `shadcn`, `tw-animate-css`, `@vercel/analytics`).
5. The delivered `next.config.mjs` is discarded — it sets
   `typescript.ignoreBuildErrors: true`.

Full design: [`docs/superpowers/specs/2026-10-03-landing-page-integration-design.md`](../superpowers/specs/2026-10-03-landing-page-integration-design.md).

## Alternatives considered

**Namespace and rewrite every landing class** (`bg-ink` → `bg-ld-ink`, ~250
occurrences). Maximum isolation, but the ported source stops matching its design
source, so every future re-export repeats the rename. Rejected: the real
collision set is two font tokens and one grey that differs by ~2%.

**Two Tailwind builds using the `prefix()` option.** The cleanest isolation, but
it needs a second PostCSS pipeline *and* the same full class rewrite. Rejected
as disproportionate.

**Adopt the landing's palette product-wide.** One coherent language, but it
restyles every verified screen and would require remapping the evidence-state
colour vocabulary. Rejected for this scope; the design in §2 keeps the option
open because the landing's tokens are added alongside the existing ones.

**Redirect signed-in users from `/` to `/workspace`.** Preserves the current
behaviour exactly, but hides the landing from reviewers who are already signed
in. Rejected.

## Consequences

- The workspace is untouched: same tokens, same fonts, same layout. Verified by
  the existing test suites plus a visual check.
- `/` is prerendered as static content (`○` in the build output), because the
  page takes no session. The anonymous sign-in redirect is the workspace's own
  guard, not a decision the landing makes.
- The landing's `--color-ink-soft` and page background differ from the original
  design by roughly 2%, because the workspace's values win. Accepted.
- The landing's component source stays byte-identical apart from import paths
  and three product-name corrections, so a future re-export diffs cleanly.
- `next/font/google` introduces a build-time font fetch; the Docker image build
  needs egress to `fonts.googleapis.com`. **Verified:** the image builds cleanly
  with the fetch (`docker build .`), so the `next/font/local` fallback with
  vendored woff2 files was not needed. If an environment ever blocks that
  egress, the fallback stands.
- `/about` now overlaps the landing in purpose. Left in place; a future decision
  should either retire it or make it the in-app continuation of the landing.
- The README's "no third-party API call" claim is preserved by dropping
  `@vercel/analytics`.
