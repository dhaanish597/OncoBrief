# Evaluation Slide Reconstruction QA & Editability Report — OncoBrief (Health-a-thon 2026)

- **QA Date:** November 6, 2026 (`2026-11-06T13:25:00+05:30`, IST)
- **Source Presentation (Preserved Untouched):** `/Users/dhaanish/Documents/OncoBrief/submission/presentation-assets/OncoBrief_Healthathon_2026_Slide10_Editable.pptx` (`1,351,466` bytes, SHA-256 `2296c0d1cd99d7fe4516f7193199aa0cf22fc9129d715e1a4104bc87d1a5f6cb`, 13 slides)
- **Output Presentation:** `/Users/dhaanish/Documents/OncoBrief/OncoBrief_Healthathon2026_Two_Editable_Evaluation_Slides.pptx` (`1,370,739` bytes, 14 slides)
- **Rendered Preview — Slide 9:** `/Users/dhaanish/Documents/OncoBrief/Slide_09_Evaluation_Editable_Preview.png` (`2400 × 1350` px)
- **Rendered Preview — Slide 10:** `/Users/dhaanish/Documents/OncoBrief/Slide_10_Evaluation_Editable_Preview.png` (`2400 × 1350` px)

---

## 1. Slide Sequence & Presentation Preservation

All original slides, masters, layouts, themes, media assets, and speaker notes from the source presentation are preserved byte-for-byte, with the two reconstructed Evaluation and User Validation slides placed consecutively at **Slide 9** and **Slide 10**:

| Final Slide # | Original Slide # | Slide Title | Status |
|---:|---:|---|---|
| **1** | 1 | `FINAL SUBMISSION — OncoBrief` | Preserved byte-identical |
| **2** | 2 | `Team Overview & Background` | Preserved byte-identical |
| **3** | 3 | `Problem Statement and Supporting Evidence` | Preserved byte-identical |
| **4** | 4 | `Target Users and Use Case` | Preserved byte-identical |
| **5** | 5 | `Solution Overview, Key Features & Impact` | Preserved byte-identical |
| **6** | 6 | `Solution Working MVP / Demo` | Preserved byte-identical |
| **7** | 7 | `Technology, Tools and AI Approach-` | Preserved byte-identical |
| **8** | 8 | `Build Sprint Journey and Progress` | Preserved byte-identical |
| **9** | 9 *(Replaced)* | `Evaluation and User Validation` *(Reference Image 1 Reconstruction)* | **Reconstructed — 168 native shapes (`0` raster images)** |
| **10** | *(Inserted)* | `Evaluation and User Validation` *(Reference Image 2 Reconstruction)* | **Inserted & Reconstructed — 191 native shapes (`0` raster images)** |
| **11** | 10 *(Shifted +1)* | `Safety and Responsible AI` | Preserved byte-identical (dynamic master `<a:fld type="slidenum">` updates to `11`) |
| **12** | 11 *(Shifted +1)* | `Deployment, Cost and Sustainability Plan` | Preserved byte-identical (dynamic master `<a:fld type="slidenum">` updates to `12`) |
| **13** | 12 *(Shifted +1)* | `What Next? Plans to take initiative forward (if any)` | Preserved byte-identical (dynamic master `<a:fld type="slidenum">` updates to `13`) |
| **14** | 13 *(Shifted +1)* | `Thank you` | Preserved byte-identical (dynamic master `<a:fld type="slidenum">` updates to `14`) |

- **Slide Dimensions:** `cx="12192000" cy="6858000"` EMU (`13.3333 in × 7.5 in`, exact 16:9 widescreen aspect ratio).
- **Master/Footer Isolation:** On Slide 9 and Slide 10, `<p:cSld showMasterSp="0">` hides the master slide's narrower placeholder footer line and slide number so there is zero double-rendering, while native editable footer shapes (`Slide9_Footer_Line`, `Slide9_Footer_Text`, `Slide9_SlideNumber` and `Slide10_Footer_Line`, `Slide10_Footer_Text`, `Slide10_SlideNumber`) reproduce the reference footers directly on the slide.

---

## 2. Programmatic Editability Verification

Both reconstructed slides were audited programmatically by parsing `ppt/slides/slide9.xml` and `ppt/slides/slide10.xml` inside the final `.pptx` archive:

| Metric | Slide 9 (Reference Image 1) | Slide 10 (Reference Image 2) | Combined Total |
|---|---:|---:|---:|
| **Total Native PowerPoint Shapes (`<p:sp>`)** | **168** | **191** | **359** |
| **Editable Native Text Boxes (`<p:sp>` with `<p:txBody>`)** | **48** | **56** | **104** |
| **Editable Native Vector / Geometry Shapes (`<p:sp>` cards, icons, rings, dividers)** | **120** | **135** | **255** |
| **Embedded Raster Picture Objects (`<p:pic>`)** | **0** | **0** | **0** |

### Key Named Editable Groups & Elements
- **Slide 9 (`slide9.xml`):**
  - Header: `Slide9_Header_AccentBar`, `Slide9_Title`, `Slide9_Subtitle`, `Slide9_Header_Branding`
  - Evaluation Approach: `Slide9_EvaluationPanel`, `Slide9_EvaluationPanel_IconBadge`, `Slide9_EvaluationPanel_Icon_Layer1..3`, `Slide9_EvaluationPanel_Title`, `Slide9_EvaluationPanel_Desc`, `Slide9_EvalRow1..5_Pill`, `Slide9_EvalRow1..5_Icon_*`, `Slide9_EvalRow1..5_Text`, `Slide9_EvalRow1..5_Check_Circle`, `Slide9_EvalRow1..5_Check_Tick`
  - Key Results: `Slide9_KeyResultsPanel`, `Slide9_KeyResults_Title`, `Slide9_KeyResults_Card_AI`, `Slide9_KeyResults_Metric_AI` (`120 / 120`), `Slide9_KeyResults_Card_System`, `Slide9_KeyResults_Metric_System` (`1,304 / 1,304`), `Slide9_KeyResults_Card_Boundary`, `Slide9_KeyResults_Metric_Boundary` (`100%`)
  - User Validation (Pilot): `Slide9_UserValidationPanel`, `Slide9_UserValidation_UsersCard`, `Slide9_UserValidation_UsersCount` (`4 users`), `Slide9_UserValidation_RatingCard`, `Slide9_UserValidation_RingTrack` (native annular ring), `Slide9_UserValidation_RingActive` (native 324° 90% annular wedge), `Slide9_UserValidation_RatingValue` (`4.5 / 5`), `Slide9_UserValidation_QuoteCard`, `Slide9_UserValidation_QuoteMark`, `Slide9_UserValidation_QuoteText`, `Slide9_UserValidation_QuoteAuthor`
  - Improvements from Feedback & Mentoring: `Slide9_MentorImprovement`, `Slide9_MentorImprovement_TrendIcon`, `Slide9_MentorImprovement_InnerBox`, `Slide9_MentorImprovement_RocketIcon_*`, `Slide9_MentorImprovement_InitialPill` (`≈45+ clicks`), `Slide9_MentorImprovement_Arrow`, `Slide9_MentorImprovement_CurrentPill` (`2 clicks`), `Slide9_MentorImprovement_Check1..3`, `Slide9_MentorImprovement_Bullet1..3`
  - Limitations & Further Validation: `Slide9_Limitations`, `Slide9_Limitations_WarningIcon_*`, `Slide9_Limitations_InnerBox`, `Slide9_Limitations_Col1..3_Icon_*`, `Slide9_Limitations_Col1..3_Title`, `Slide9_Limitations_Col1..3_Body`, `Slide9_Limitations_Div1..2`
  - Footer: `Slide9_Footer_Line`, `Slide9_Footer_Text`, `Slide9_SlideNumber` (`9`)
- **Slide 10 (`slide10.xml`):**
  - Header: `Slide10_Header_AccentBar`, `Slide10_Title`, `Slide10_Subtitle`, `Slide10_Header_Branding`
  - Evaluation Approach: `Slide10_EvaluationApproach`, `Slide10_EvalItem1..3_Icon_*`, `Slide10_EvalItem1..3_Title`, `Slide10_EvalItem1..3_Desc`
  - AI Model Testing: `Slide10_AIModelTesting`, `Slide10_AIModelTesting_HeaderIcon_*`, `Slide10_AIModelTesting_Card1..3`, `Slide10_AIModelTesting_Card1..3_Icon_*`, `Slide10_AIModelTesting_Card1..3_Metric` (`30/30`, `36/36`, `20/20`), `Slide10_AIModelTesting_Card1..3_Label`
  - User Validation: `Slide10_UserValidation`, `Slide10_UserValidation_InnerBox`, `Slide10_UserValidation_UsersCount` (`4 users`), `Slide10_UserValidation_ThumbIcon_*`, `Slide10_UserValidation_RatingValue` (`4.6 / 5`)
  - Key Results: `Slide10_KeyResults`, `Slide10_KeyResults_InnerBox`, `Slide10_KeyResults_Col1..5_Icon_*`, `Slide10_KeyResults_Col1..5_Metric` (`1,304 / 1,304`, `86 / 86`, `100%`, `100%`, `100%`), `Slide10_KeyResults_Col1..5_Label`, `Slide10_KeyResults_Div1..4`
  - Improvements Based on Feedback: `Slide10_Improvements`, `Slide10_Improvements_ChartIcon_*`, `Slide10_Improvements_ClicksCard`, `Slide10_Improvements_CursorIcon_*`, `Slide10_Improvements_ClicksMetric` (`45+ → 2`), `Slide10_Improvements_Check1..3`, `Slide10_Improvements_Bullet1..3`, `Slide10_Improvements_FooterNote`
  - Limitations & Further Validation: `Slide10_Limitations`, `Slide10_Limitations_WarningIcon_*`, `Slide10_Limitations_Sec1..3_Icon_*`, `Slide10_Limitations_Sec1..3_Title`, `Slide10_Limitations_Sec1..3_Body`, `Slide10_Limitations_Div1..3`
  - Footer: `Slide10_Footer_Line`, `Slide10_Footer_Text`, `Slide10_SlideNumber` (`10`)

---

## 3. Separate QA Notes on Discrepancies Between the Two Reference Designs (Unmodified in Slides)

In strict compliance with Section 3 of the specification (*"Do not change any figures to match figures on the other reference slide... If you identify apparent inconsistencies or unsupported claims, report them separately in a QA note after completing the PowerPoint. Do not silently edit the reference content"*), all text and numbers from each reference image were preserved verbatim on its respective slide. When manually combining or editing the two slides, please note the following differences between the two reference designs and the repository evidence audit (`EVALUATION_AND_USER_VALIDATION_SLIDE_EVIDENCE.md`):

1. **AI Model Test Case Count (`120 / 120` on Slide 9 vs. `86 / 86` on Slide 10):**
   - **Slide 9 (Reference Image 1)** reports `120 / 120 AI model test cases passed (extraction, summarization & safeguards)`.
   - **Slide 10 (Reference Image 2)** reports `86 / 86 AI model test cases passed (quality, safety, grounding)`, which equals the sum of its three upper-middle sub-cards (`30/30` clinical boundary & safety + `36/36` source-grounding & evidence + `20/20` output quality & format = `86/86`), and also corresponds to the Oct 24 `@oncobrief/adapters` test count (`86/86` in `docs/review-evidence/2026-10-24/final-verify.log`; expanded to `110/110` in the Nov 2 Phase 04 run).
2. **Usability Rating & Role Wording (`4.5 / 5` on Slide 9 vs. `4.6 / 5` on Slide 10):**
   - **Slide 9 (Reference Image 1)** displays `4.5 / 5 Overall usability rating` with `(3 engineering team members + 1 doctor partner)` and a pilot quote attributed to `– Doctor Partner (Pilot)`.
   - **Slide 10 (Reference Image 2)** displays `4.6 / 5 overall usability rating` with `(3 engineers, 1 oncologist)`.
   - *Repository Audit Context:* As documented in `EVALUATION_AND_USER_VALIDATION_SLIDE_EVIDENCE.md` (Section 7), Team ICONIX includes a Doctor Partner (**Bhoomi Goel**) alongside 3 engineering leads, but no formal quantitative usability survey (`4.5/5` or `4.6/5`) or external clinician pilot was logged in the repository. If keeping a numeric usability score or quote, ensure that your team's Doctor Partner (**Bhoomi Goel**) has recorded and signed off on that exact internal walkthrough rating prior to live judging Q&A.
3. **Clinical Boundary Denominator (`29 / 29` vs. `30 / 30`):**
   - **Slide 9** reports `100% Clinical boundary tests passed (29 / 29)` (`17` unit tests in `messages-and-boundary.test.ts` + `12` classifier tests in `classify.test.ts` = `29`).
   - **Slide 10** reports `30/30 Clinical boundary & safety tests passed` in its upper-middle panel, `100% Source-grounding & provenance validation (30/30)` (`24` unit tests in `span-validation.test.ts` + `6` DB tests in `two-stage-span-gate.test.ts` = `30`), and `100% Unsafe / diagnostic prompts blocked (29/29)` in its lower-left panel.
4. **Spelling Artifact in Reference Image 1 (`"Serveo AI evaluation"` vs. `"Sarvam AI evaluation"`):**
   - In **Reference Image 1** (lower-right *Limitations & Further Validation*, middle column), the raster reference image contains a visible image-generation glyph typo: **`Serveo AI evaluation`**.
   - To obey the strict rule *"Preserve: All visible wording... Do not silently edit the reference content"*, `Slide9_Limitations_Col2_Title` reproduces `"Serveo AI evaluation"` as shown in Reference Image 1, whereas `Slide10_Limitations_Sec2_Title` has `"Multi-use (Sarvam AI) validation"`. Because `Slide9_Limitations_Col2_Title` is a native editable PowerPoint text box, you can click it and change `Serveo` to `Sarvam` in 1 second when finalizing your combined slide.
5. **Footer Wording Difference:**
   - **Slide 9** reproduces Reference Image 1's footer: `HEALTH-A-THON 2026  •  FINAL SUBMISSION` with slide number `9`.
   - **Slide 10** reproduces Reference Image 2's footer: `HEALTH-A-THON 2026  •  FINAL SUBMISSION  •  ONCOBRIEF (CANCER CARE TRACK)` with slide number `10`.
