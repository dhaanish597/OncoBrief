# OncoBrief — Deep Research Report
### Competitive Landscape, Novelty Strategy & Implementation Reference for Health-a-thon 2026 (Cancer Care Track)

---

## 1. Case Studies and Human Cost (The Evidence Base)

The case for OncoBrief has to rest on documented, high-frequency operational failure — not a rare edge case. The evidence below shows the "chart archaeology" and follow-up-loss problems are close to universal in oncology, in India and globally.

### 1.1 The scale of the diagnostic-and-treatment-delay problem in India

Indian tertiary-centre studies consistently show long, multi-stage delays, and a recurring theme in the qualitative interviews behind these studies is **navigation confusion**, not just clinical severity:

- A Delhi public-hospital study of oral cancer patients found the diagnostic interval was consistently the longest single component of overall delay, with pathways frequently un-verifiable even by researchers because patients could not produce consistent supporting records.
- A North-East India breast-cancer cohort at a regional cancer institute found a median overall delay of 203 days (diagnosis to treatment), with treatment delay (130 days) outweighing presentation delay (35 days) — i.e., the bigger loss happens *after* a patient is already inside the system.
- A qualitative Indian study on breast-cancer care pathways found patients "lost their way in the process of multiple referrals," repeating diagnostic work because private clinics could not complete full work-ups and there was no consistent hand-off of prior results between providers.
- A Mumbai tertiary cancer hospital study of 500 breast-cancer patients found 14% discontinued treatment outright, with financial disorientation and travel burden (average 1,044 km travelled) as major contributors.
- Kerala and South Indian lung-cancer studies attribute a large share of delay to "referral interval" — the gap between a first clinician visit and arrival at a centre equipped to confirm diagnosis — which is exactly the interval where paper/scan records get lost or duplicated.

None of this is a rare-disease problem. It is the modal experience of an Indian cancer patient moving between a primary provider, a diagnostic lab, and a tertiary cancer centre.

### 1.2 The clinician-side burden (why "chart archaeology" is real and costly)

- A quantitative review of EHR-workflow burden found physicians average **4.5 hours/day** in EHR workflow, with roughly a third of that (~1.5 hrs/day) spent specifically on chart review; medical residents were found to spend over **112 hours/month** reading charts.
- Oncology-specific inbox-burden research (2019–2022 national trend data) found medical oncologists/hematologists carry the **highest EHR time and inbox load** of any oncology subspecialty, and that burden has been rising since COVID-19.
- Oncology-focused reporting describes complex new-patient chart preparation routinely taking **20–45 minutes per patient** before the consultation even starts — the exact task OncoBrief targets.
- Multiple ASCO burnout surveys identify EHR/administrative burden, "pajama time" (after-hours charting), and loss of autonomy as leading burnout drivers among oncologists specifically — not primary care.

### 1.3 The patient-side burden (why an administrative-only fix on the clinician side is not sufficient by itself)

Public-hospital and regional oncology-centre non-attendance for scheduled follow-ups and chemotherapy cycles has been reported in the **30–40% range**, and the qualitative literature attributes this overwhelmingly to non-clinical causes: inability to read complex discharge instructions, unclear pre-procedure prep steps, missed follow-up dates, and caregiver logistics — not disease severity. This is corroborated independently by the peer-reviewed India delay literature above (financial disorientation, referral confusion, travel burden).

**Implication for the entry:** a clinician-only "record readiness" tool (OncoBrief as originally scoped) closes half the loop. It will save physician minutes but will not, by itself, move the attrition numbers that are the actual life-and-death lever in Indian oncology. This is addressed directly in Section 3.

---

## 2. Existing Solutions — Government, Commercial, and Prior Hackathons — and Why They Underperform

### 2.1 Government / public infrastructure

**India — Ayushman Bharat Digital Mission (ABDM) / ABHA**
ABDM is the obvious "why don't we just wait for the government to solve this" objection a judge may raise, so the entry needs a precise answer. As of 2026, ABDM has linked over 100 crore digital health records and issued 90+ crore ABHA IDs — a genuinely massive rollout. But the documented gaps are structural, not transitional:
- **Private-sector adoption lag.** Private hospitals — where the majority of India's oncology capacity sits — have been slow to integrate beyond backend/billing systems; smaller nursing homes and diagnostic labs cite cost and unclear ROI. Compliance is now being *mandated* (e.g., Bihar's 2026 AB-PMJAY directive), which itself signals adoption was not happening voluntarily.
- **Interoperability gaps between state HMIS systems and the national layer**, meaning a linked ABHA record does not guarantee a *complete* longitudinal record — labs, radiology, and private specialists frequently sit outside the network.
- **The digital divide** in rural/tribal areas limits the "patient carries their own record" premise ABHA depends on.
- Even optimistic 2026 commentary frames ABDM as laying *foundational* infrastructure, explicitly noting the "focus must now shift towards adoption" — i.e., the record-linkage problem is not solved for oncology-specific document types (pathology reports, chemo administration sheets, radiation summaries) even where ABHA exists.

**Global — patient-held records and continuity-of-care interventions (NHS and other single-payer systems)**
Patient-held records (the pre-digital and early-digital version of "let the patient carry their own data") have been studied for over two decades in cancer care specifically. A systematic review of RCTs found **an absence of measurable effect** on continuity-related outcomes; benefit, where seen, was in non-experimental (uncontrolled) studies only. Separately, UK GP-continuity research found **no meaningful association** between doctor-patient continuity and time-to-diagnosis for breast/lung cancer, and a *slightly worse* association for colorectal cancer — continuity of relationship does not, on its own, fix a broken document trail.

**Global — human patient navigation programs**
Patient navigation (Harold Freeman/ACS model) is the most evidence-backed non-clinical intervention that exists, with real, replicated benefit — e.g., a Hispanic-community breast-screening navigation program raised mammography uptake from 60% to 80%. But the cost-effectiveness literature is explicit about the limitation that matters most for a hackathon entry: **navigation programs are heterogeneous, expensive to scale (roughly $275–2,080/patient/year across studies), and outcome evidence is strongest for screening uptake, weaker and more mixed for treatment-phase coordination** — exactly the phase (post-surgery, post-op follow-up, between chemo cycles) where OncoBrief's own case studies (Section 1) show the worst Indian attrition. Human navigators do not scale to NCG's 370+ member-hospital network at hackathon cost.

**Takeaway for judges:** government infrastructure (ABDM) is necessary but not sufficient — it standardizes *identity*, not oncology-specific *document completeness or task follow-through*. Human navigation works but doesn't scale on hackathon budgets. This is the actual gap OncoBrief needs to sit in, not "there is no government/EHR effort at all."

### 2.2 Commercial "existing solutions" globally — and why a copy would be a wrapper

- **Vizlitics / Cancer Insights (US)** is the closest global analogue and the most important one to differentiate from honestly. Its "New Consult Workflow" product already does source-linked, longitudinal, AI-drafted pre-consult summaries, claims **anti-hallucination guardrails that link every output back to source**, and reports pulling records from **93% of US health systems** electronically. It also runs tumor-board and clinical-trial-matching modules. **This means "source-grounded pre-consult summarization" itself is not novel — Vizlitics already ships it at scale in the US.**
- **DeepScribe** and **Suki** are ambient-documentation platforms (encounter-time note generation, coding, EHR integration) — their centre of gravity is *during* the visit, not pre-visit record reconstruction from fragmented external paper/scans.
- **India — Karkinos Healthcare** (acquired by Reliance) runs a hub-and-spoke oncology network with **human patient navigators ("KareMitra")** plus a "Command Centre" coordinating diagnostics, referrals and radiation scheduling across partner hospitals.
- **India — Navya Care**, built with Tata Memorial Centre / National Cancer Grid, provides AI-assisted **evidence-based treatment opinions** and supports multidisciplinary tumour-board case review nationally, and is explicitly trying to decentralise tertiary-level expertise to smaller towns.

**Why copying any of these would be a wrapper, and what genuinely isn't covered:**
Vizlitics' model *assumes* a US-style electronically-interoperable EHR layer (93% pull rate) — that assumption does not hold in India, where the same qualitative literature in Section 1 shows patients physically carrying paper, faxes and scans between providers, and where ABDM has not yet solved oncology-document-type interoperability (Section 2.1). Karkinos and Navya both solve *access to expertise and human coordination*, not *machine-verifiable provenance over a hospital's own already-fragmented paper/scan archive*. None of the four systems above are built specifically for the **zero-integration, paper/scan-dominant, multi-format, multilingual environment** that describes most non-Vizlitics-tier Indian hospitals — which is most of the NCG's 370-hospital, ~60%-of-national-load network. That gap — not "AI summarization of oncology records," which is already commercialized — is where real novelty has to be built.

### 2.3 Prior hackathon solutions

Health-a-thon 2026 is the **first edition** of this specific hackathon (Koita Foundation / IIT Bombay KCDH / NCG / FOGSI / RSSDI), so there is no direct prior-year Health-a-thon entry to benchmark against. Broader Indian hackathon precedent (Smart India Hackathon, IndiaAI/CDSCO Health Innovation Hackathon) shows a recurring pattern worth noting for judges: winning healthcare entries in India skew toward **document-intelligence and workflow-automation problem statements** (structured extraction from unstructured regulatory/clinical documents, missing-field flagging, version-change detection) rather than diagnostic AI — which is directly analogous to OncoBrief's non-diagnostic, evidence-ledger design and suggests this category of entry is judge-legible and fundable, not just internally consistent with the rules.

---

## 3. Innovative Ideas to Beat Existing Solutions

Given Section 2, "we extract facts from scanned documents and show provenance" is **not**, by itself, a winning USP — Vizlitics already does it at scale. Novelty needs to come from four places that are genuinely under-served:

**3.1 Deployment model, not just the model.** Build for the hospital that has *no* EMR integration budget and no near-term ABDM completeness — a browser-overlay/secure-upload hybrid that reads whatever a clinician already has open (scanned PDF, fax, WhatsApp-forwarded report photo) rather than requiring an API contract with 93% of a national EHR market. This is the honest, defensible novelty claim: **interoperability-independent provenance**, purpose-built for India's actual document mix (paper, fax-to-PDF, regional-language handwriting), not for a market that already has electronic interoperability.

**3.2 Close the loop on both sides — this is the single highest-leverage change to the current scope.** Section 1.3 showed clinician-side prep time is not the lever that saves lives; treatment-phase attrition (30–40% non-attendance) is. A judge who has read the evidence will ask why a hackathon entry ignores the bigger number. The fix is architectural, not a scope violation: keep OncoBrief's evidence ledger as the single source of truth, and add a **thin, strictly non-clinical patient/caregiver-facing companion** that reads *administrative* facts already verified in the ledger (a documented follow-up date, a "bring prior imaging" instruction, a next-cycle date) and pushes them out as low-literacy, multilingual reminders over WhatsApp/voice/IVR — never generating new medical content, only relaying human-approved administrative facts from the ledger. This turns a "consult-prep tool" into a "care-continuity engine" and directly targets the delay/attrition statistics in Section 1, which is what actually moves the 60–90-day impact judges are told to weigh.

**3.3 Fix what Vizlitics and generic LLM-summarization tools do *not* claim to fix: contradiction handling and staleness.** The 2025–2026 clinical-LLM-safety literature is blunt about the current state of the art: independent studies report **hallucination rates from ~1–2% in controlled settings up to 42–61% of summaries containing at least one unsupported claim in open-ended/real-world settings**, and a scoping review found only 7% of published medical-summarization studies used external validation and only 3% assessed patient-safety risk at all. "Source-grounded" is necessary but is not the same as *safe* — a model can cite a real document and still misstate what it says, or silently prefer one of two conflicting dates. Two concrete, buildable differentiators follow directly from this literature:
   - **Fact-state separation** (Extracted → Verified → Corrected → Rejected) so nothing reaches a clinician's screen as if it were confirmed until a human has actually confirmed it — this is a stronger claim than "cites a source," and is cheap to build as a database constraint, not a model capability.
   - **Reconciliation rooms**: when two source documents disagree on a date or value, surface both side-by-side and force an explicit human resolution (retain-both / mark-superseded / correct-with-reason) instead of letting the LLM silently pick one — directly targeting the omission/hallucination failure mode the literature flags as under-measured.

**3.4 Administrative digital twin, not another clinical summarizer.** Model the *document/task state* of the patient's journey (what exists, what's missing, what's overdue, who owns it) as a first-class object independent of any generated narrative. This reframes the product away from "yet another AI summary tool" (crowded, and exactly where the hallucination literature above says trust is weakest) toward an auditable operations layer — closer to a workflow/ops product than a clinical-AI product, which is also easier to defend against "out of scope: clinical decision support" objections from judges.

**3.5 Overcoming the "existing AI-EHR" problem specifically.** The mitigation-strategy literature (RAG, knowledge-graph grounding, self-reflection, human-in-the-loop, specialised training, red-teaming) converges on **human-in-the-loop plus retrieval-grounding** as the two most evidence-backed mitigations — which is exactly the evidence-ledger + mandatory-human-confirmation design already in the platform doc. The addition this research suggests: treat **omission**, not just hallucination, as an equally tracked failure mode (the literature shows omission rates are frequently *higher* than hallucination rates in real-world use) — i.e., the missing-document-reconciliation feature (3.9 in the original design) is doing more real safety work than the hover-to-source feature, and should be pitched to judges as the primary safety claim, not a secondary one.

---

## 4. Judge's Perspective and Winning Strategy

**4.1 Track selection is defensible.** Cancer Care is backed by the National Cancer Grid — 370+ centres, ~60% of India's oncology case load under one standardized network — which is the single best distribution path of the three tracks for piloting a single hospital-agnostic tool. The failure mode in oncology (missed follow-up → progression to an incurable state) is also more binary and lethal within a 60–90-day judging window than the slower-moving diabetes or maternal-health tracks, which supports the "high impact, not a rare condition" framing the brief explicitly asks for: chart-review burden and follow-up attrition are majority-case problems for oncology patients in India, not an edge case.

**4.2 The "not a wrapper" bar.** Given Section 2.2, a judge with any oncology-tech familiarity will recognize "AI reads scattered records and produces a source-linked pre-consult summary" as an existing, commercialized category (Vizlitics). The entry needs to open with an explicit, one-slide acknowledgment of that landscape and state its differentiation precisely (3.1–3.4) rather than presenting evidence-grounded summarization as if it were unclaimed territory — judges will trust a team more, not less, for demonstrating they searched.

**4.3 Guardrail compliance is a scoring asset, not just a constraint.** The brief's out-of-scope list (diagnosis, treatment recommendation, clinical decision support, risk scoring, interpretation of medical data, autonomous clinical advice) maps cleanly onto the evidence-ledger design's non-diagnostic boundary — the pitch should show this mapping explicitly (a table: guardrail → design feature that enforces it) rather than asserting compliance in prose.

**4.4 Claims discipline.** An earlier internal research pass on this same idea (the uploaded "Strategic Architectural Blueprint" document) produced specific, presentation-ready numbers — chart-review time cut from 8 to 2 minutes, 20% clinic-capacity increase, 35–50% reduction in follow-up attrition, no-show rates cut from 30% to under 10%. **These numbers should not be presented to judges as validated results.** Their cited sources are Reddit threads (r/medicine, r/Radiology) and vendor marketing pages, not peer-reviewed or pilot data — see Section 5.2. Presenting them as measured outcomes is a credibility risk if a judge checks a footnote; presenting the same claims as **explicit, falsifiable hypotheses to be tested in the pilot** is not, and is exactly the posture the hackathon brief itself recommends ("designed to reduce... rather than "reduces X to Y").

**4.5 Winning narrative in one line.** *"India's cancer-care fragmentation problem isn't unsolved because no one has tried AI summarization — it's unsolved for hospitals that can't afford the interoperability Vizlitics assumes, and for the treatment-phase attrition that record-summarization tools don't touch at all. OncoBrief targets both, with human-confirmed, contradiction-aware provenance as the safety layer the 2025–26 clinical-LLM-safety literature says is still missing industry-wide."*

---

## 5. Implementation Reference

### 5.1 Suggested tech stack

The uploaded prior-research document proposes a fully Sarvam-AI-based Indic stack (Sarvam Vision OCR, Sarvam-105B LLM via LangChain/"Hermes Agents," Sarvam Saaras v3 ASR, Sarvam Bulbul v3 TTS, WhatsApp webhooks/IVR). This is a reasonable **regional-language layer** for the patient-facing companion (3.2) — genuinely useful given India's multilingual, code-mixed (Hinglish/Tanglish) speech requirement — but for a 60–90-day hackathon build it should be treated as one option among standard, swappable components, not a single-vendor dependency:

| Layer | Purpose | Options to evaluate |
|---|---|---|
| Document ingestion / OCR | Scans, faxes, handwriting, layout-preserving extraction | Sarvam Vision OCR (Indic-tuned); open-source alternatives (Tesseract + layout model, PaddleOCR); cloud document-AI APIs as fallback for typed reports |
| Structured extraction | Map raw text → schema (dates, doc type, facility, event) with bounding-box provenance | LLM-based extraction with a constrained JSON schema (function-calling / structured outputs), not free-text summarization |
| Orchestration / agent framework | Route document → classify → extract → reconcile → task-queue | LangChain or a lighter deterministic state-machine for the parts that don't need an LLM (task routing, dedup) — deterministic code where possible is *safer and cheaper* than an agent for anything rule-based |
| Evidence ledger / data store | Fact-state (Extracted/Verified/Corrected/Rejected), source pointers, version hashes, audit log | Postgres with an explicit event-sourced schema; this is the actual core IP, not the LLM |
| Reasoning / summarization | Draft the chronological briefing from ledger facts | Any strong LLM (Sarvam-105B, or a general-purpose model) constrained to only restate ledger facts — no free generation of new claims |
| Patient voice/text channel | Multilingual reminders, follow-up nudges, escalation to a human coordinator | Sarvam Saaras/Bulbul for Indic ASR/TTS, or existing cloud speech APIs; WhatsApp Business API for text/voice notes |
| Access layer | Zero-integration path for hospitals without EMR APIs | Browser extension (DOM-read overlay) + secure document upload, matching the three-pattern integration model (SMART on FHIR where available, upload for smaller centres, extension as a transitional bridge) already in the platform design |

### 5.2 Honest data gaps & workarounds

Being direct about this with judges is itself part of the winning strategy (Section 4.4):

- **No pilot data exists yet**, and the specific percentages in the earlier internal blueprint (8→2 min chart review, 20% capacity gain, 35–50% attrition reduction, 30%→10% no-show reduction) trace back to informal clinician discussion threads on Reddit and vendor product pages, not clinical studies. **Workaround:** re-derive defensible ranges from the peer-reviewed literature actually gathered in Section 1 (e.g., 20–45 min chart prep per complex oncology consult; 30–40% documented non-attendance in Indian public-hospital oncology follow-up; 203-day median India breast-cancer diagnosis-to-treatment delay) and cite those instead — they are weaker-sounding but real, and traceable to named studies.
- **No direct access to NCG member-hospital workflow data** during a hackathon. **Workaround:** a short structured interview (3–5 oncologists/nurses, even informally through NCG contacts or the hackathon's doctor-matchmaking phase) converted into a simple before/after time-estimate table beats an uncited percentage claim, and demonstrates the "workflow-first" judging criterion directly.
- **No validated multilingual-voice-intent accuracy number** (the blueprint's "95% intent accuracy" target is an aspiration, not a measurement). **Workaround:** state it as a target metric for the Phase-2 pilot (Days 31–60), not a current capability, consistent with hackathon guidance to use hypothesis-oriented language.
- **ABDM/ABHA linkage data completeness for oncology-specific document types (pathology, radiation, chemo administration sheets) is not publicly quantified** — the aggregate "105 crore records linked" figure does not break out by specialty or document type, so it cannot be used to claim ABDM already solves this. **Workaround:** state this as a known unknown rather than assuming either full coverage or full absence; frame OncoBrief as complementary to ABDM (usable as an ABDM-linked-record *consumer* where available, and as a standalone document-intake layer where it is not).

---

## Sources

Key sources consulted (grouped by section; full list available on request):
- Oral/breast/cervical/lung cancer delay studies: Research Square (Lok Nayak Hospital oral cancer), JCO Global Oncology (cervical cancer COVID delays), PMC (breast cancer care pathways, North-East India BBCI study, Mumbai treatment discontinuation study), South Asian Journal of Cancer (Kerala lung cancer delays), PMC "Being sick to a cancer patient."
- Oncologist/EHR burden: arXiv 2407.16905 (chart-review burden), PMC (oncology EHR inbox trends 2019–2022), Medscape (EHR burden in oncology 2026), ASCO Educational Book and JCO Oncology Advances (oncologist burnout).
- ABDM: PIB press releases (2026 ABHA milestones), digitalhealthnews.com (ABDM hospital-level challenges), ocacademy.in and Arthur D. Little (private-sector adoption barriers), impriindia.com (interoperability/digital-divide gaps), nirmitee.io/ehr.network (2026 AB-PMJAY compliance mandate).
- Patient-held records / continuity: PMC/Wiley systematic reviews on patient-held records in cancer care; PMC (patient–doctor continuity and cancer diagnosis, England).
- Patient navigation cost-effectiveness: Wiley/Cancer journal (Ramsey et al.), AJMC (cervical-screening navigation cost-effectiveness), PMC (colorectal navigation economic review, FQHC navigation study).
- Commercial landscape: Vizlitics/Cancer Insights (company site, NIH SEED profile, Northwestern Medicine partnership release), Karkinos Healthcare (company site, Tracxn profile), Navya Care (eHealth Magazine, Tracxn profile).
- LLM/EHR safety literature: arXiv (CARE conformal safety layer, hallucination-detection preference optimization), Frontiers in Digital Health (medical-summarization scoping review), medRxiv (CREOLA clinical-safety framework), BMC (hallucination-mitigation systematic review).
- Health-a-thon 2026 structure: healthathon.reskilll.com, koitafoundation.org, reskilll.com blog, internshala.com listing.
