# Health-a-thon submission pack

Source repository: [dhaanish597/OncoBrief](https://github.com/dhaanish597/OncoBrief), branch **main**. Start with the [release checklist](RELEASE_CHECKLIST.md) for the integrated source's verification and limits.

## Review the product

1. Read the [root overview and quick start](../README.md).
2. Follow the [evaluator guide](../docs/aws-deployment/23-hackathon-evaluator-guide.md) and [demo flow](../docs/demo-flow.md): fragmented documents → extracted evidence → source inspection → human verification → contradiction reconciliation → record readiness → source-backed task → consultation packet → approved continuity message → audit trail.
3. Inspect the [web app](../apps/web/), [patient mobile app](../apps/mobile/README.md), [extension](../apps/extension/) and [worker](../apps/worker/).
4. Read [architecture and product rules](../docs/README.md), [provider/deployment disclosures](../docs/aws-deployment/24-hackathon-deployment-report.md), and [research evidence](../docs/research/README.md).

The November 5 deployment report records an access-restricted synthetic evaluator site at https://d1idx0s43enxlm.cloudfront.net. Access credentials must be shared privately. Repository integration is not a redeployment; the deployed image may predate this source release.

Current URLs are collected in [submission links](LINKS.md).

## Existing submission files

- [Submission presentation](OncoBrief_Healthathon_2026_ICONIX_6FQ4CN.pptx)
- [Submission PDF](OncoBrief_Healthathon_2026_Final_Submission.pdf)
- [Editable presentation assets](presentation-assets/)
- [November 6 editable slide drafts](presentation-assets/2026-11-06/) — 14 slides with two evaluation alternatives; consolidate before a final portal upload
- [Earlier decks and templates](archive/) — preserved originals; filenames containing “Final” do not establish current approval
- [Asset move/checksum manifest](ASSET_MANIFEST.json)
- [Historical short demo videos](../reports/visual-proof/index.html)
- [Release media and debug APK](https://github.com/dhaanish597/OncoBrief/releases/tag/healthathon-2026-11-06), with [checksums and packaging limits](RELEASE_ASSETS.json)
- [Tutorial transcript](tutorial/OncoBrief_Tutorial_Transcript.md), [chapters](tutorial/OncoBrief_Video_Chapters.md), [subtitles](tutorial/OncoBrief_Tutorial_Subtitles.srt)

Decks/PDFs are preserved as supplied; this release does not assert their old demo links, provider claims, specialty fields or round-specific template satisfy the next round's portal rules. Use the source/docs and fresh checklist as the current technical record. No event-portal submission or credential publication is performed here.

## Demonstration boundaries

Synthetic data only; not for real patient use. ABDM and outbound messaging remain simulated in the documented evaluator profile. Browser tests, native bundle export, APK compilation and physical-device testing are distinct. Historical research is not pilot outcome evidence, and no clinical efficacy or regulatory approval is claimed.
