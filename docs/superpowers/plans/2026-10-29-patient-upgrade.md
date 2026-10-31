# Patient app transformation — implementation checklist

Upgrade the existing apps/mobile Expo application in place. Preserve its ledger, native storage, consent, imports, source inspection, packet export, English/Tamil and five routes. No clinician website changes. User approved generated concept exec-69d4e89e-e547-4406-a01d-1e55dadfc5b9.png and provided three consultation/lab references on 29 October 2026.

Design: cool #F4F7FB background, white panels, navy #16263C typography, cobalt #315CE7, 16px panels, fine grey separators, compact sans hierarchy, consistent outline icons. Home, detailed labs and guided preparation follow the approved three-screen composition. Preserve actual fixture provenance wherever generated image text differs. Use supplied chart designs as anatomy, never as patient data.

- [x] Test lab projection/search/date filtering, unit-safe arithmetic comparison, valid range indicators, editable/removable questions, richer timeline and wellbeing history.
- [x] Implement deterministic selectors and state transitions. Retain existing persisted-state compatibility and original ledger.
- [x] Upgrade shared shell, typography, tokens, navigation icons and compact result/status components.
- [x] Implement /labs and /lab/[test] with source-backed result cards, selected-point chart, time filters, reference band, horizontal indicator, highlights and accessible history.
- [x] Replace home with connected source panels and useful links. Add preparation stages and question editing/deletion. Add dedicated wellbeing charts and timeline search/categories/order.
- [x] Preserve record/import/share/export flows and update bilingual copy.
- [x] Typecheck, lint, unit/regression tests, browser interactions and screenshots, compare accepted concept directly with rendered mobile UI, Android bundle and prebuild checks.

Existing backend review: mobile-auth still accepts patient-id header/cookie and falls back to a database patient with clinician context. No safe authenticated patient contract or laboratory observation endpoint is verified. Continue isolated synthetic fallback; no new medical values or integrations. Dataset supports one test/two observations, not the fictional potassium/creatinine history in the visual references. General explanation may use authoritative glossary material; no patient-specific medical interpretation.

Source UI references: clipboard 17e1a49f… (consultation), 0375a9fc… (lab trends), b4ce5c4d… (detailed ranges), plus user-approved concept 6ff07121…. Native Android execution depends on SDK availability; report actual results.

Final verification, 30 October 2026: TypeScript and lint pass; 30 mobile unit tests pass; all 15 Edge/Playwright workflows pass (57.3s). Web export, Android prebuild and final Hermes export pass. Clinical-boundary and branding scans pass. No Android SDK/device/emulator is available and no APK was built. Database retry outside the sandbox confirms four integration suites blocked by ECONNREFUSED 127.0.0.1:5433; 15 database unit tests pass. No new production service or infrastructure was added.

Review fixes: editing a saved question preserves an unrelated new-question draft; wellbeing filters use displayed local calendar dates; month windows clamp month ends; web filter buttons expose pressed state. Regression tests cover these behaviors. Earlier browser failures from duplicated selected/history text and selected-state HTML semantics were corrected, then the complete suite reran green.

Fidelity evidence and intentional copy/layout deviations are recorded in apps/mobile/README.md. Accepted concept and final home/lab/preparation/Tamil screenshots were inspected with view_image in the same pass. Palette, heading hierarchy, rounded white panels, outline icons, consultation asset, reference-band chart and home section ordering match the approved direction. Actual source names/dates and safety statuses are preserved; accessible targets and explicit preparation stages require scrolling on phone viewports. No material unexplained visual mismatch remains. No live APIs, diagnosis, medication facts or invented laboratory tests were introduced.
