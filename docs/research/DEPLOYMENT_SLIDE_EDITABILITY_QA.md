# Deployment, Cost and Sustainability Plan — Editable Slide Reconstruction & QA Report

- **QA Timestamp:** November 6, 2026 (`IST`)
- **Project:** OncoBrief (Team ICONIX — Health-a-thon 2026, Cancer Care Track)
- **Source Presentation (Preserved Untouched):** [`OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx`](../../submission/presentation-assets/2026-11-06/OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx) (`1,370,739` bytes, 14 slides)
- **Output Presentation:** [`OncoBrief_Healthathon2026_Deployment_Editable.pptx`](../../submission/presentation-assets/2026-11-06/OncoBrief_Healthathon2026_Deployment_Editable.pptx) (`1,373,352` bytes, 14 slides)
- **Rendered High-Resolution Preview:** [`OncoBrief_Deployment_Slide11_Preview.png`](../../submission/presentation-assets/2026-11-06/OncoBrief_Deployment_Slide11_Preview.png) (`2400 × 1350` px, 16:9 widescreen)

---

## 1. Source Presentation Selection & Slide Index Audit

All PowerPoint files in `/Users/dhaanish/Documents/OncoBrief` were inspected by modification timestamp, slide count, and slide structure:

1. [`OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx`](../../submission/presentation-assets/2026-11-06/OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx) — Modified **Nov 6, 2026 at 13:46 IST** (`1,370,739` bytes, 14 slides). Contains both reconstructed native Evaluation slides (`Slide 9` and `Slide 10`) and the reconstructed native Safety slide (`Slide 11`). **Selected as the canonical source deck.**
2. [`submission/presentation-assets/OncoBrief_Healthathon_2026_Slide10_Editable.pptx`](file:///Users/dhaanish/Documents/OncoBrief/submission/presentation-assets/OncoBrief_Healthathon_2026_Slide10_Editable.pptx) — Modified Nov 5, 2026 (`1,351,466` bytes, 13 slides; older pre-Evaluation-reconstruction deck).
3. [`docs/OncoBrief_Healthathon_2026_Final_Submission.pptx`](file:///Users/dhaanish/Documents/OncoBrief/docs/OncoBrief_Healthathon_2026_Final_Submission.pptx) — Modified Nov 3, 2026 (`438,243` bytes, 13 slides; earlier baseline).

### Target Slide Position vs. Displayed Footer Slide Number

Because `OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx` includes two `Evaluation and User Validation` slides at positions 9 and 10 (for manual consolidation into one final Evaluation slide), the slide titled **`Deployment, Cost and Sustainability Plan`** resides at **Slide Position 12** (`ppt/slides/slide12.xml`), corresponding to **Original Template Slide 11**.

| Deck Position | XML Part | Slide Title | Preservation / Reconstruction Status |
|---:|---|---|---|
| **1** | `ppt/slides/slide1.xml` | `FINAL SUBMISSION — OncoBrief` | Byte-identical (`SHA-256` match) |
| **2** | `ppt/slides/slide2.xml` | `Team Overview & Background` | Byte-identical (`SHA-256` match) |
| **3** | `ppt/slides/slide3.xml` | `Problem Statement and Supporting Evidence` | Byte-identical (`SHA-256` match) |
| **4** | `ppt/slides/slide4.xml` | `Target Users and Use Case` | Byte-identical (`SHA-256` match) |
| **5** | `ppt/slides/slide5.xml` | `Solution Overview, Key Features & Impact` | Byte-identical (`SHA-256` match) |
| **6** | `ppt/slides/slide6.xml` | `Solution Working MVP / Demo` | Byte-identical (`SHA-256` match) |
| **7** | `ppt/slides/slide7.xml` | `Technology, Tools and AI Approach-` | Byte-identical (`SHA-256` match) |
| **8** | `ppt/slides/slide8.xml` | `Build Sprint Journey and Progress` | Byte-identical (`SHA-256` match) |
| **9** | `ppt/slides/slide9.xml` | `Evaluation and User Validation` *(Option 1)* | Byte-identical (`SHA-256` match) |
| **10** | `ppt/slides/slide10.xml` | `Evaluation and User Validation` *(Option 2)* | Byte-identical (`SHA-256` match) |
| **11** | `ppt/slides/slide11.xml` | `Safety and Responsible AI` | Byte-identical (`SHA-256` match) |
| **12** | `ppt/slides/slide12.xml` | **`Deployment, Cost and Sustainability Plan`** | **Reconstructed — 100 native `<p:sp>` objects (`0` `<p:pic>`)** |
| **13** | `ppt/slides/slide13.xml` | `What Next? Plans to take initiative forward (if any)` | Byte-identical (`SHA-256` match) |
| **14** | `ppt/slides/slide14.xml` | `Thank you` | Byte-identical (`SHA-256` match) |

- **Package Integrity Verification:** Out of `150` ZIP archive entries in `OncoBrief_Healthathon2026_Deployment_Editable.pptx`, `148` entries (all 13 other slides, slide masters, slide layouts, themes, media assets, and speaker notes) are **100% byte-identical** to `OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx`. Only `ppt/slides/slide12.xml` and `ppt/slides/_rels/slide12.xml.rels` (removing the old raster logo reference `rId3`) were updated.
- **Footer Slide Number Note:** In strict compliance with the reference image, `Slide12_SlideNumber` displays **`11`** (matching the original 13-slide template numbering once the two Evaluation slides at positions 9 and 10 are merged into one). Because `Slide12_SlideNumber` is a standalone editable PowerPoint text box, it can also be changed to `12` in one click if both Evaluation slides are retained.

---

## 2. Programmatic Editability Verification (`ppt/slides/slide12.xml`)

| Audit Metric | Count | Verification Result |
|---|---:|---|
| **Total Native PowerPoint Shapes (`<p:sp>`)** | **100** | 100% native DrawingML shapes |
| **Editable Native Text Boxes (`<p:sp>` with `<p:txBody>`)** | **50** | Every title, subtitle, label, cost figure, and footnote is individually editable |
| **Editable Native Vector / Card / Icon Shapes (`<p:sp>`)** | **50** | Every card, pill, divider, arrow, checkmark, and icon is native vector geometry |
| **Embedded Raster Picture Objects (`<p:pic>`)** | **0** | Zero flattened screenshots or bitmap icons |

### Complete Inventory of Reconstructed Native PowerPoint Objects

1. **Header (`4` native objects):**
   - `Slide12_Header_AccentBar` — Native rounded vertical green pill (`#0D8A2E`).
   - `Slide12_Title` — Editable text box: `Deployment, Cost and Sustainability Plan` (Arial Bold `29.5pt`, `#0C2D9E`).
   - `Slide12_Subtitle` — Editable text box: `OncoBrief  •  Cost-optimized AWS pilot in Mumbai  •  Scale safely from one hospital to many` (Arial Regular `14pt`, `#3B4A68`).
   - `Slide12_Header_Branding` — Editable multi-run text box: `Health-` (`#0D8A2E`) + `a-thon ` (`#0C2D9E`) + `2026` (`#0C2D9E`, top-aligned superscript offset).
2. **Upper-Left Main Container — `Proposed deployment architecture` (`39` native objects):**
   - `Slide12_Arch_Container` — Outer rounded rectangle (`#F9FBFF` fill, `#DCE6F4` border).
   - `Slide12_Arch_Title` (`Proposed deployment architecture`) & `Slide12_Arch_Subtitle` (`Secure access  →  modular compute  →  protected records`).
   - **Node 1 (`Hospital users`):** `Slide12_Arch_Node1_Card` (`#EEF5FF`), 6 native vector shapes forming the 3-person group outline icon (`Slide12_Arch_Node1_Icon_CenterHead`, `CenterBody`, `LeftHead`, `LeftBody`, `RightHead`, `RightBody`), `Slide12_Arch_Node1_Title` (`Hospital users`), and `Slide12_Arch_Node1_Desc` (`Authorized staff` / `and clinicians`).
   - **Arrow 1:** `Slide12_Arch_Arrow1` (native `<a:custGeom>` right arrow in `#0E5AE0`).
   - **Node 2 (`CloudFront + ALB`):** `Slide12_Arch_Node2_Card` (`#EDF4FF`), `Slide12_Arch_Node2_Icon_Cloud` (native cubic-bezier cloud outline in `#0E5AE0`), `Slide12_Arch_Node2_Title` (`CloudFront + ALB`), and `Slide12_Arch_Node2_Desc` (`HTTPS edge &` / `internal origin`).
   - **Arrow 2:** `Slide12_Arch_Arrow2` (native `<a:custGeom>` right arrow in `#0E5AE0`).
   - **Node 3 (`ECS + SQS/Lambda`):** `Slide12_Arch_Node3_Card` (`#F4EEFC`), 6 native vector shapes forming the 3-tier server stack with status dots (`Slide12_Arch_Node3_Icon_ServerTier1..3`, `ServerDot1..3`), `Slide12_Arch_Node3_Title` (`ECS + SQS/Lambda`), and `Slide12_Arch_Node3_Desc` (`Web platform &` / `async document jobs`).
   - **Arrow 3:** `Slide12_Arch_Arrow3` (native `<a:custGeom>` right arrow in `#0E5AE0`).
   - **Node 4 (`RDS + S3`):** `Slide12_Arch_Node4_Card` (`#EBF9F1`), 4 native vector shapes forming the 3-tier database cylinder (`Slide12_Arch_Node4_Icon_DBTop`, `DBBody`, `DBMid1`, `DBMid2`), `Slide12_Arch_Node4_Title` (`RDS + S3`), and `Slide12_Arch_Node4_Desc` (`PostgreSQL 16 &` / `encrypted storage`).
   - **Smart AI / OCR Routing Strip:** `Slide12_Arch_Routing_Strip` (`#EAF3FF`), `Slide12_Arch_Routing_Label` (`SMART AI / OCR ROUTING`), `Slide12_Arch_Routing_Providers` (`Local PDFs  •  AWS Textract  •  Sarvam Vision  •  Amazon Bedrock`), and `Slide12_Arch_Routing_Subtext` (`Use low-cost parsing first; route complex documents to specialist services`).
3. **Upper-Right Main Panel — `100-user hospital` Monthly Cost Card (`14` native objects):**
   - `Slide12_Cost_Container` — Outer rounded rectangle (`#ECF9F0` fill, `#CBEAD4` border).
   - Native green wallet icon (`Slide12_Cost_Wallet_Body`, `Slide12_Cost_Wallet_Clasp`, `Slide12_Cost_Wallet_Dot`).
   - Separate editable text boxes for `Slide12_Cost_Title` (`100-user hospital`), `Slide12_Cost_Sublabel` (`MODELED MONTHLY COST`), `Slide12_Cost_PrimaryINR` (`₹12,606`), `Slide12_Cost_PerMonth` (`/ month`), `Slide12_Cost_GSTLine` (`₹14,875 including 18% GST`), `Slide12_Cost_Divider` (`#CBE2D2`), `Slide12_Cost_DocVolume` (`2,500 docs / month`), `Slide12_Cost_UnitCost` (`₹5.04 / doc`), `Slide12_Cost_PagesUsers` (`10,000 pages  •  100 registered users`), and `Slide12_Cost_Footnote` (`Planning estimate, not an actual AWS bill`).
4. **Lower-Left Panel — `Pilot → multi-hospital scale` (`11` native objects):**
   - `Slide12_Scale_Container` (`#F3F7FE` fill, `#DCE6F6` border), `Slide12_Scale_Title` (`Pilot → multi-hospital scale`), 3 pairs of left/right editable text boxes (`25-user pilot` / `₹6,008/mo`, `100-user hospital` / `₹12,606/mo`, `5 hospitals` / `₹10,462 each/mo`), 2 horizontal divider lines (`Slide12_Scale_Divider1..2`), and `Slide12_Scale_Footnote` (`All estimates exclude GST unless stated`).
5. **Lower-Centre Panel — `Setup & pre-pilot readiness` (`14` native objects):**
   - `Slide12_Readiness_Container` (`#FFFBF0` fill, `#F2E4C6` border), `Slide12_Readiness_Title` (`Setup & pre-pilot readiness`), 3 native check badges (`Circle` + `Tick`), and 3 pairs of bold heading + subtitle text boxes (`One-time setup: not yet costed` / `Depends on hospital integration scope`, `EHR / FHIR / ABDM gateway setup` / `plus required approvals and agreements`, `Resolve pre-launch engineering blockers` / `Migrations, upload races, TLS & credentials`).
6. **Lower-Right Panel — `Sustainability by design` (`14` native objects):**
   - `Slide12_Sustain_Container` (`#F7F3FE` fill, `#E5DCF8` border), `Slide12_Sustain_Title` (`Sustainability by design`), 3 native check badges (`Circle` + `Tick`), and 3 pairs of bold heading + subtitle text boxes (`Lower idle cost` / `NAT-free networking + ARM64 Fargate`, `Pay for the right OCR` / `Local first; Textract / Sarvam as needed`, `Scale on demand` / `SQS/Lambda jobs, caching & S3 lifecycle`).
7. **Footer (`4` native objects):**
   - `Slide12_Footer_Line` (`#CFDCEB`), `Slide12_Footer_Left` (`HEALTH-A-THON 2026  •  FINAL SUBMISSION`), `Slide12_Footer_Source` (`Source: AWS deployment ZIP (5 Nov 2026)  •  ₹84.50/USD  •  no credits assumed`), and `Slide12_SlideNumber` (`11`).

---

## 3. Separate QA Notes on Repository vs. Reference Image Alignment

In strict adherence to the instruction *"Do not silently change any reference text or numbers"*, every figure and phrase from the reference image is reproduced verbatim on the slide. For your team's live Q&A preparation, note the following provenance details:

1. **Cost Figures (`₹12,606/mo` / `$149.18/mo` at `₹84.50/USD`):**
   - The reference slide's cost figures (`₹6,008/mo` for 25-user pilot, `₹12,606/mo` ex-GST / `₹14,875` inc-18%-GST / `₹5.04/doc` for 100-user hospital at `2,500 docs / 10,000 pages`, and `₹10,462 each/mo` for 5 hospitals) come from the **Nov 5, 2026 AWS deployment cost model** (`Source: AWS deployment ZIP (5 Nov 2026) • ₹84.50/USD • no credits assumed`), which modeled an **ECS Fargate ARM64 + SQS/Lambda + RDS PostgreSQL 16 + S3 + CloudFront/ALB** topology without NAT Gateways.
   - In the newer `docs/aws-deployment/05-cost-model-and-pricing-breakdown.md` audit generated earlier today, an alternative ultra-low-cost EC2 Docker Compose single-node baseline (`~$45.80/mo` / `₹3,870/mo`) and a Multi-AZ Fargate + NAT Gateway hospital tier (`~$177.27/mo` / `₹14,980/mo`) were also modeled. All three sets of numbers are internally consistent with their respective architectural assumptions (NAT-free ARM64 Fargate + SQS/Lambda on the slide vs. EC2-first or NAT-Gateway Fargate in the deep-dive docs).
2. **Slide Position (`12`) vs. Printed Slide Number (`11`):**
   - The deck currently has 14 slides because two candidate `Evaluation and User Validation` slides exist at positions 9 and 10. Once you delete whichever Evaluation slide you do not keep, this slide shifts back to position 11, matching its printed footer number `11`.
