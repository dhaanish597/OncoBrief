# OncoBrief — Landing Page Integration

**Date:** 2026-10-03
**Status:** Approved, in implementation
**Input artifact:** `onco-brief-landing-page-redesign.zip` (39 files, standalone Next.js 16 app)
**Decision record:** [`docs/decisions/0016-landing-page-integration.md`](../../decisions/0016-landing-page-integration.md)

---

## 1. Context

A landing page redesign was designed externally (v0.app) and delivered as a
**standalone Next.js 16 application**, not as a component drop. It carries its
own design language, its own fonts, its own root layout, its own dependency set
and its own fictional fixture data.

The existing product is `apps/web` — a Next.js 15 application whose evidence
workspace is verified against the deployed AWS environment
(`docs/final-submission-verification.md`). That workspace must not regress.

This document defines how the landing page becomes the product's public front
door without disturbing the verified application.

## 2. Intent

Make the landing page part of the shipped site: the public story that sits in
front of the evidence workspace, reachable at `/`, with one click into the
workspace.

**Success criteria**

1. `/` renders the landing page, signed in or not.
2. The evidence workspace is visually and behaviourally unchanged.
3. `pnpm verify` stays green — typecheck, eslint, clinical-boundary scan,
   branding scan, all unit tests.
4. The existing Playwright suites (`demo-flow`, `assistant`, `deployed`) still
   pass.
5. A new Playwright spec covers the landing route.

## 3. Constraints

| Source | Constraint |
|---|---|
| `CLAUDE.md` | Non-clinical boundary. No diagnosis, staging, prognosis, treatment or risk output. |
| `tools/check-clinical-boundary.ts` | Must stay clean. |
| `tools/validate-branding.ts` | `OncoBrief` is the only product name; asserts the name in `layout.tsx`, `login/page.tsx`, `(app)/layout.tsx`. |
| `README.md` | "No third-party API call is made at any point." |
| `CLAUDE.md` | No secrets in source; decision record for architectural change. |

## 4. Decisions

### 4.1 The landing's visual language stays scoped to the landing

The workspace keeps its current appearance. The landing does not become the
product-wide design system.

*Rationale:* the workspace is verified and submission-ready. A product-wide
restyle would require re-verifying every screen and remapping the evidence-state
colour vocabulary (`--color-state-extracted` etc.), for no gain in this scope.

### 4.2 Add four dependencies; drop five

Add `motion`, `lucide-react`, `clsx`, `tailwind-merge` — each demonstrably used.

Drop `@base-ui/react`, `class-variance-authority` (imported only by
`components/ui/button.tsx`, which nothing imports), `shadcn` (its stylesheet is
imported but no shadcn component is used), `tw-animate-css` (imported, no
`animate-*` utility used anywhere), and `@vercel/analytics` (a third-party
browser call that would contradict the README and is redundant on an
AWS/CloudFront deployment).

### 4.3 `/` always renders the landing

Signed-in users are **not** redirected to `/workspace`. The primary CTA adapts:
`/workspace` when a session exists, `/login` otherwise.

*Rationale:* a reviewer who has signed in should still be able to read the
product story. Redirecting would hide the landing from exactly the audience
most likely to look for it.

### 4.4 Styling: one Tailwind build, scoped wrapper

The landing shares the application's single Tailwind build. Its *new* tokens are
added to the existing `@theme`; **colliding tokens keep the workspace's value**
and the landing's intent is restored inside a `.landing` wrapper by scoped rules
whose specificity beats the global utility.

Landing component source is otherwise unchanged, so a future re-export diffs
cleanly.

## 5. Design

### 5.1 File layout

```
apps/web/src/app/
  page.tsx                        DELETE — the "/" redirect
  (landing)/
    layout.tsx                    NEW — font variables, .landing wrapper, metadata
    page.tsx                      NEW — landing composition
  (app)/…                         untouched
apps/web/src/components/landing/  NEW — 16 components
apps/web/src/lib/landing/
  data.ts                         from lib/oncobrief.ts
  cn.ts                           from lib/utils.ts
apps/web/src/app/globals.css      EXTEND only — never redefine a shared token
```

`(landing)` is a sibling route group to `(app)`, so `/` renders without the
session-requiring shell in `(app)/layout.tsx`.

**Not carried over:** the zip's `app/`, `public/`, `next.config.mjs`,
`tsconfig.json`, `postcss.config.mjs`, `pnpm-lock.yaml`, `package.json`,
`components.json`, `components/ui/button.tsx`, `lib/utils.ts`, and every
`placeholder-*` image.

The zip's `public/` holds nothing adoptable: `icon.svg` is the v0.app
generator's own logo (the paths spell "v0"), and the rest are `placeholder-*`
files and v0's default light/dark icons. The workspace's existing
`apps/web/src/app/icon.svg` — a genuine OncoBrief mark in the product palette —
stays as the app icon.

`next.config.mjs` is discarded deliberately: it sets
`typescript.ignoreBuildErrors: true`, which would silently disable the
typecheck that currently passes.

### 5.2 Token reconciliation

| Token | Workspace | Landing | Action |
|---|---|---|---|
| `--color-ink` | `#1b1a17` | `#1b1a17` | identical — share |
| `--color-ink-soft` | `#4a463f` | `#57524a` | keep workspace value; landing shifts ~2% |
| `--font-mono` | system stack | Geist Mono | keep workspace value; override inside `.landing` |
| `--font-serif` | system stack | Instrument Serif | keep workspace value; override inside `.landing` |
| `--color-accent` | `#7a2e2e` | shadcn `var(--oxblood)` | workspace value stands; landing uses `oxblood` directly |
| ivory, bone, oxblood, teal, sage, amber, alert | — | new | add to `@theme` |
| 15 shadcn semantic tokens | — | used only in dead code | delete; inline the 4 real uses |
| `dot-grid`, `line-grid`, `paper`, `ocr-brackets`, keyframes | — | new names | add |

`--font-mono` and `--font-serif` are the dangerous pair: `.mono` and `.doc-text`
in `globals.css` read them directly, and `.mono` appears on nearly every
workspace screen.

The landing's global resets are scoped rather than global:

```css
/* was: * { @apply border-border outline-ring/50 }  — would restyle the workspace */
.landing * { border-color: color-mix(in oklab, var(--color-ink) 16%, transparent); }
.landing :focus-visible { outline-color: var(--color-teal); }
```

### 5.3 Copy and boundary

- Three occurrences of `Oncobrief` (lowercase *b*) → `OncoBrief`.
- The safety copy is retained verbatim, including
  *"It does not diagnose, stage, recommend or decide treatment"* and the footer's
  *"Not a medical device for diagnosis or treatment decisions. Sample data shown
  is fictional."*
- The landing's illustrative fixtures (`SRC-0412`, `EV-1042`) are a **second,
  fictional dataset**, distinct from the application's demo fixtures. They stay
  labelled as fictional; they are not reconciled with the real ledger.
- The clinical-boundary scanner does not scan prose (by design — a document may
  legitimately contain the word "prognosis"), so this copy was reviewed by hand.

### 5.4 Routing and chrome

| Route | Behaviour |
|---|---|
| `/` | Landing page. Always public. |
| `/workspace` … | Unchanged, session-required. |
| `/login` | Unchanged; gains a small "Back to overview" link to `/`. |
| `/about` | Unchanged. Overlaps the landing in purpose; a later decision, not this one. |

The primary CTA resolves by session: `/workspace` when signed in, else `/login`.

**Revised 2026-10-04.** The three "Explore" affordances — the desktop nav button
and mobile menu entry (*Explore platform*) and the hero button (*Explore
OncoBrief*) — previously jumped to the in-page `#surfaces` anchor. They now
target `/workspace`, the product's own entry gate: its session guard forwards an
anonymous visitor to `/login`, while a signed-in visitor proceeds straight in
rather than being asked to sign in again. This keeps `/workspace` the single
entry point instead of introducing a second, and leaves the `#surfaces` section
in place — still reachable by scrolling and via the `Surfaces` section mark.

Metadata: the landing's title and description move to `(landing)/layout.tsx` as
a route-level override. `apps/web/src/app/layout.tsx` keeps
`OncoBrief — source-verified record readiness`, which is what the branding guard
asserts.

### 5.5 Fonts

`next/font/google` (Geist, Geist Mono, Instrument Serif) applies the font
variables on the `.landing` wrapper inside `(landing)/layout.tsx` — not on the
root `<html>` — so no workspace element inherits them.

**Build-time network fetch:** the Docker image build will need egress to
`fonts.googleapis.com`. If that proves unavailable, the fallback is
`next/font/local` with the three woff2 files vendored.

## 6. Testing

**Regression (must stay green)**

- `pnpm typecheck`, `pnpm lint` (eslint + boundary + branding)
- 394 unit tests (domain 301, adapters 24, worker 26, web 43)
- Playwright `demo-flow` (14) against a local Postgres

**New**

- `apps/web/e2e/landing.spec.ts` (8 tests):
  - `/` returns 200 and renders the hero headline without a session
  - the non-clinical disclaimer is present (hero strip, safety principles, footer)
  - the primary CTA reaches the workspace gate — `/workspace` when signed in,
    `/login` when anonymous
  - `/workspace` still redirects to `/login` without a session
  - no workspace chrome (sign-out button, nav links) leaks onto `/`
  - `/login` links back to the overview, and a signed-in visitor reaches the
    workspace from the landing
  - **the two visual languages stay separate** — computed styles pin the token
    reconciliation: the landing's ivory/Instrument Serif/Geist Mono do not reach
    the workspace, whose paper, ink and `--font-mono` keep their values

The last test automates the mitigation for this design's top risk (§7): the two
surfaces share one Tailwind build, so a shared token changed by accident would
silently restyle the verified workspace. It fails loudly instead.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A shared token is changed by accident, silently restyling the workspace | Only additive `@theme` edits; `--font-mono`/`--font-serif`/`--color-ink-soft` explicitly untouched. Now **enforced** by `landing.spec.ts` test 8, which pins both surfaces' computed styles, so an accidental change fails CI rather than relying on a visual check. |
| A landing import is missed during the `@/*` rebase | Typecheck fails loudly on an unresolved module — no silent path. |
| Font fetch breaks the Docker build | Verified: `docker build .` succeeds — `/` prerenders static and the Geist/Instrument fetch resolves. `next/font/local` with vendored woff2 remains the fallback if egress is ever blocked. |
| The landing's illustrative data is mistaken for real clinical data | Footer disclaimer retained; fixtures remain labelled fictional. |

## 8. Non-goals

- Product-wide restyle of the workspace (deferred; §4.1).
- Reconciling the landing's fixtures with the application's demo fixtures.
- Replacing `/about`.
- Wiring the landing's CTAs to real product analytics or a waitlist.
