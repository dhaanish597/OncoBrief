# OncoBrief Complete User Tutorial

All patient records and demonstrated responses are synthetic. Real browser recordings; no screenshots substitute for application footage.


## 01. Introduction and sign-in

**00:00:00.000 — What OncoBrief does**

Welcome to OncoBrief. This tutorial uses the real application with a separate synthetic training database. OncoBrief helps hospital teams reconstruct fragmented oncology records, check their sources, and prepare consultations. The Evidence Ledger stores source-linked facts. The timeline displays that ledger. People remain responsible for verification, approvals, and every clinical decision.

**00:00:22.867 — Evidence before interpretation**

A referral can arrive as several reports from different facilities. OncoBrief keeps those documents connected to extracted candidates and human review decisions. Extraction does not establish medical truth. Missing records and disagreements remain visible. This is an operational training environment, and simulated integrations will be identified when we reach them.

**00:00:45.733 — Sign in**

The public overview leads to the sign-in page. Staff use an authorized hospital account to open their workspace. The password field stays masked. Here we use the supplied synthetic clinician account. A successful sign-in creates a server-managed session and opens the organization workspace.


## 02. Global and patient navigation

**00:01:05.667 — Hospital-wide navigation**

The top navigation contains hospital-wide modules: Workspace, Patients, Appointments, My Tasks, Tumor Board, Analytics, and What This Is. Use these to manage work across patients. The role label identifies the current account, but visible navigation alone does not prove permission to perform an action.

**00:01:26.033 — Patient-specific navigation**

Opening a patient introduces a second navigation level. Overview, Encounters, Evidence Journey, Clinical Context, Sources, Reconciliation, Record Map, Care Team, Tasks, Packet, Continuity, and Audit all belong to this patient. Always check the patient identifier before uploading a document or changing a record.

**00:01:46.333 — Return to the global workspace**

Patient tabs preserve chart context, while the top navigation returns to hospital-wide work. Here we return to the workspace, then open the patient directory. Clinicians review source evidence; coordinators and records staff prepare the record. Later we will sign in as other roles to verify the differences.


## 03. Workspace and consultation readiness

**00:02:07.933 — Readiness worklist**

The readiness worklist combines registered patients, available documents, missing required records, unresolved conflicts, unverified evidence, and tasks. Record readiness is administrative completeness. It is not a clinical risk score or permission to treat. A blocked row tells staff which record problems still need attention.

**00:02:28.300 — Search and filter**

Use the patient or MRN search and the readiness, clinician, and department filters to focus the worklist. We search for the fragmented referral and submit the filter. The resulting row retains direct links to its chart, conflicts, unverified evidence, and assigned administrative work.

**00:02:48.233 — Distinct timeline and OPD views**

The longitudinal timeline is a different view over a selected patient’s ledger. The OPD view shows persisted clinic slots and queue states. Switching between them changes the content in this build. Readiness describes the record; OPD flow describes the visit and clinic capacity.


## 04. Register and maintain a synthetic patient

**00:03:08.167 — Create the administrative identity**

Start in Patients and choose Register New Patient. Registration creates the hospital identity to which documents, evidence, appointments, and encounters will attach. We enter a clearly synthetic name and a unique training MRN. Demographic entry does not establish a diagnosis or generate a treatment plan.

**00:03:28.933 — Contact, language, and referral metadata**

Contact details and language preferences support administrative communication. We use an example-dot-invalid address and leave the phone empty so no real destination is introduced. Care-team and department assignments can be made now or later. The notes explicitly identify this as a synthetic training record.

**00:03:49.300 — Edit and confirm persistence**

After saving, the patient overview is the home for this chart. We reopen the permitted edit page, update the administrative address, save, and refresh. The saved value confirms that this is a database-backed record, not a temporary form preview. The MRN links future documents to the correct identity.


## 05. Patient overview and readiness

**00:04:11.333 — Read the overview**

We now open DEMO-001, the seeded fragmented referral. The overview collects demographics, record status, care-team information, scheduled appointments, encounters, documents, and recent evidence. The fixture badge identifies synthetic data. Counts describe stored records and help staff choose which part of the chart to inspect next.

**00:04:33.500 — Blocked and Record Ready**

The blocked banner explains the current administrative obstacles: a missing required record and unresolved source conflicts. Overdue tasks describe unfinished operational work. Compare this with DEMO-003, whose required documents and verification are complete. Record Ready means the preparation checks passed; a clinician still decides what happens during care.


## 06. Real document upload and processing

**00:04:55.533 — Choose an original synthetic document**

Sources is the patient’s document inventory and upload entry point. We return to our newly registered training patient and select an original synthetic referral PDF from disk. The file itself is labelled Synthetic Demo. Confirm the patient, selected filename, and document language before submitting.

**00:05:15.900 — Upload and wait for the real result**

Upload and ingest sends the actual file through the application. This recording uses local PDF text extraction and deterministic candidate extraction. A PDF text layer is different from optical recognition of a scanned image. The processing display is useful feedback, but the stored source and evidence are the checks that establish what actually completed.

**00:05:40.433 — Inspect the uploaded source**

Open the uploaded document to inspect the source viewer and its extracted evidence. Each candidate should retain the supporting page and text span. We refresh the source page to confirm the document persists. Ingestion success and human verification are separate states; no fact is silently confirmed by this upload.

**00:06:02.867 — Upload a second report and review the ledger**

Both original PDFs persisted, but this ledger remains empty. In this local path, stored OCR text is incomplete and no candidates were promoted. An upload-complete banner therefore cannot be read as successful fact extraction. We will test a second standard PDF encoding next and retain this failure in the report.

**00:06:24.467 — Test a second standard PDF encoding**

Here we upload a standard PDF with a different text encoding. It contains the same synthetic identity and explicit administrative instructions. This is a real second processing attempt, not a replacement success screen. The earlier parsing failure remains a limitation of this local implementation.

**00:06:44.833 — Confirm real extracted candidates**

This encoding produces source-linked candidates in the Evidence Ledger. We open one candidate’s supporting passage, inspect it, and verify a matching transcription in this synthetic record. The source and review state remain after refresh. The result demonstrates this tested PDF path, while the earlier encoding failure prevents any claim that all PDFs work reliably.

**00:07:09.333 — Upload an actual scanned image**

We also upload a raster image of the synthetic referral. Image OCR must read pixels rather than a PDF text layer. This local image recognizer produced poor text in rehearsal. We show its real stored result so staff can see why upload status, OCR quality, extracted candidates, and verification need separate checks.

**00:07:33.033 — Inspect OCR and classification metadata**

The stored OCR text for this scan is garbled. Do not verify a candidate that cannot be supported by the original passage; request a clearer source or a governed transcription. Back in Sources, the document-type confirmation is a separate metadata action. We confirm the standard referral’s category without treating that as evidence verification.

**00:07:57.133 — Import and existing-source options**

Import from EHR and ABDM offers standard bundle examples and a consent workflow. This environment uses the simulated gateway; those controls are not proof of a live hospital connection. Link to Existing searches the stored document set to support duplicate review. Browser-extension grants are deliberately not minted on camera because they would expose a temporary access token.


## 07. Evidence Journey and human verification

**00:08:22.900 — Read the longitudinal evidence**

Evidence Journey orders documented events along a patient timeline. Each row retains a source, date where documented, confidence indication, and reviewer state. An extracted row is awaiting review. A conflicting row signals disagreement. Historical procedures and medications are shown as written in the documents, without inferring a diagnosis or future treatment.

**00:08:46.167 — Open the exact supporting passage**

The source link takes us from a candidate fact to the document and page that support it. The highlighted passage comes from stored source spans. Review the value, wording, date, and document identity together. Confidence describes extraction quality; it does not replace this comparison with the original.

**00:09:07.767 — Verify and reopen**

For this synthetic example, we confirm that the displayed transcription matches its source. The Verify action records a human review decision. We reload the page and check that Verified remains visible. Corrections and rejections are separate decisions, and their history should preserve the original extraction rather than silently replacing it.


## 08. Clinical Context and consultation encounters

**00:09:30.600 — Review source-backed clinical history**

Clinical Context organizes recorded historical information and laboratory observations for review. Charts provide dates, units, and source-specific ranges where available. A trend is a view of documented values, not a new medical conclusion. Use the source links to inspect unexpected values and leave interpretation to the responsible clinician.

**00:09:52.633 — Open an encounter**

Encounters group work around a consultation. A visit can link to an appointment or start as an ad hoc outpatient encounter. We create a synthetic training encounter, then inspect the workspace. Historical ledger information and clinician-authored notes have different purposes and should remain distinguishable.

**00:10:13.000 — Save and reopen an administrative draft**

The note form includes clinical fields for a qualified clinician. We do not invent an assessment or plan. We save only a labelled administrative training draft, explaining that no clinical assessment was entered. Reloading the encounter verifies persistence. Final signing would be a separate accountable clinician action.


## 09. Source conflicts and reconciliation

**00:10:34.600 — Inspect a real seeded conflict**

Reconciliation lists disagreements detected between source-backed facts. Open a reconciliation room to compare both values and their original passages. A date mismatch does not authorize the software to select the clinically correct document. Both sources remain available, and the responsible reviewer must choose an explicit outcome.

**00:10:55.800 — Retain both with a reason**

Available outcomes include retaining both conflicting values, superseding one, or correcting with a reason. For this training case we retain both and request confirmation from the issuing facility. This records a review disposition without asserting which date is medically correct. The application returns to the conflict list; we refresh to verify the saved state.


## 10. Record Map and missing documents

**00:11:20.333 — Inspect administrative completeness**

Record Map compares available document categories with the selected institutional checklist. Required, optional, present, and missing are administrative statuses derived from the configured template. A missing marker means a source is absent from this record set. It does not establish that a test or procedure is medically required.

**00:11:42.367 — Create a source-backed retrieval task**

A missing document can become a retrieval task while retaining its gap as the origin. We enter a specific training task and deadline, then submit it and open Tasks. This creates traceable administrative work. Staff should not invent additional medical requirements simply to make the checklist appear complete.


## 11. Care team, ownership, and task handoffs

**00:12:04.400 — Assign a care-team member**

We now sign in as the synthetic coordinator. Care Team records the people responsible for this chart. The coordinator can assign hospital staff and their operational team role. We add Anita as the care coordinator for the training patient and save. This roster records ownership; it does not infer clinical responsibilities from document text.

**00:12:28.933 — Confirm owner and deadline**

Tasks display their source origin, status, deadline, and creator. The coordinator assigns the new retrieval task to herself, checks the explicit confirmation box, and saves. We then open My Tasks to verify that the cross-patient worklist reflects the assignment. A handoff should always retain its source and accountable owner.

**00:12:51.367 — Record work in progress**

We return to the patient task, move it to in progress, and add an operational note. Refreshing confirms the stored state. Completion would require the underlying work to be done; we leave this retrieval task in progress because no authorization document has actually been obtained. Overdue labels compare the deadline with the current date.


## 12. Consultation packets and document studio

**00:13:15.900 — Assemble a source-linked packet**

A consultation packet assembles the patient identity, document inventory, transcribed history, verified dates, open conflicts, missing records, and confirmed tasks. We use the ready fixture to create a new draft. Empty sections remain visible so the reviewer can distinguish absence from an omitted section. Every evidence line keeps its source.

**00:13:38.767 — Review, approve, and export**

After reviewing the complete synthetic packet, the clinician records an approval note and approves it. Approval freezes the packet at a ledger sequence. We download the implemented JSON export and inspect its stored structure. The page also offers print-to-PDF and structured interchange links; these are distinct from the JSON file demonstrated here.

**00:14:02.467 — Create and inspect a studio draft**

The document studio generates editable artifacts from ledger facts and selected institutional references. Here its badge identifies the deterministic fallback engine. We create a source-cited referral draft and inspect the result. The synthetic SOP is a training reference with no institutional affiliation. Draft text requires review, and no generated document is a treatment recommendation.


## 13. Appointments and scheduling

**00:14:27.000 — Book a synthetic appointment**

Appointments is the persistent scheduling directory. Choose a patient, clinician, room, date, time, and visit type. We book an administrative training consultation for Asha Demo Tutorial. The booking form accepts a time interval rather than displaying a live slot marketplace; the service checks scheduling conflicts when it saves.

**00:14:49.033 — Confirm the saved booking**

We refresh the directory, find the training patient, and confirm the booking. The patient overview also shows the scheduled consultation. This cross-check connects hospital-wide scheduling to the chart. An appointment confirmation records a scheduling state; it does not record attendance or clinical clearance.

**00:15:08.967 — Calendar and available actions**

The calendar offers another view of scheduled consultations. The directory provides confirmation, check-in, start-consult, and cancellation controls according to state and permission. Rescheduling exists in the server actions, but this directory does not expose a reschedule form. We do not imply that an unseen control was demonstrated.


## 14. Live oncology OPD and slot backfill

**00:15:30.567 — Read the queue**

OPD Flow tracks clinic capacity and visits: scheduled patients, tokens, check-in, consultation, staff-confirmed delays, cancellations, and vacant slots. Record-readiness badges remain separate. A prepared record can still be waiting, and a checked-in patient can still have missing records. These are operational states with different meanings.

**00:15:51.367 — Confirm check-in**

We record a synthetic check-in for the ready fixture. The action drawer requires an operational reason and an explicit confirmation checkbox. Saving changes the stored queue state. This staff-entered demonstration records the simulated arrival of a fixture, not evidence that a real patient attended the hospital.

**00:16:12.567 — Review a vacant slot offer**

For a vacant slot, staff can review waitlisted candidates. Eligibility uses the configured scheduling rules and administrative readiness. Reviewing candidates is not an offer, and offering is not acceptance. We inspect the drawer before deciding what can be demonstrated safely. No patient message is sent by this review.

**00:16:34.600 — Reserve and accept a synthetic offer**

The drawer contains an eligible synthetic waitlist entry. We select it and explicitly confirm a slot offer. The reservation is separate from acceptance. For this controlled training record we then record synthetic acceptance with an operational note. The refreshed slot shows the assigned patient and the stored result.


## 15. Tumor board administration

**00:16:56.633 — Meeting agenda and source boundaries**

Tumor Board coordinates a multidisciplinary meeting: schedule, location, presenters, patient cases, packets, and document checklists. This seeded meeting has a thoracic title while some fixtures contain breast-record text. That is demo configuration, not a claim of clinical appropriateness. Any staging or consensus must remain clinician-authored or source-linked.

**00:17:20.000 — Create a training meeting**

We schedule a clearly labelled synthetic training meeting, enter its date and location, and save. The new meeting appears in the meeting list. This is administrative coordination. Creating a meeting does not determine who needs multidisciplinary review or what treatment should be discussed.

**00:17:39.933 — Register a case and save preparation status**

We register our synthetic patient to the training meeting and assign a presenter. Staging remains blank because no verified staging evidence has been established for this chart. The new case appears with its preparation checklists unconfirmed. The registration menu remains open, so we must close it before saving the administrative note.

**00:17:56.900 — Save the administrative preparation note**

With the registration menu closed, we save a labelled administrative preparation note and refresh to check it. The note states that clinical review and consensus are pending. The title Save Consensus Record also saves administrative fields; using that button here does not establish that a clinical consensus occurred.


## 16. Patient and caregiver continuity

**00:18:18.933 — Caregiver consent and preferences**

Continuity relays verified administrative information after a visit: appointment dates, documents to bring, and coordination contacts. Caregiver registration captures a relationship, language, voice preference, and a consent record. This is a synthetic training consent entry, not consent from a real person. External delivery is configured as a simulated local outbox.

**00:18:41.800 — Register a synthetic caregiver**

We register a fictional caregiver with a reserved example phone number and Tamil preference. Saving creates the local caregiver record. Consent revocation and preference controls are separate actions. A real hospital must obtain valid patient consent through its own process before recording or using these details.

**00:19:03.000 — Compose from a verified administrative fact**

The coordinator can compose a draft from an approved template and a verified appointment fact. We use the documented date exactly as stored. In this ready fixture that date is historical, so this is a template demonstration rather than a current appointment instruction. Composition is separate from clinician approval and delivery.

**00:19:26.267 — Approve and preview without real delivery**

We switch to the clinician account to review and approve the synthetic administrative message. The approved draft can be previewed in supported languages and voice modes. A provider badge alone is not proof that audio generation succeeded. We keep outbound delivery local and do not claim that any patient received a message.

**00:19:49.967 — Request a real voice preview**

We request a Tamil voice preview of the approved administrative reminder. The application contacts its configured speech service and displays either an audio player or an explicit fallback. A preview does not send a message. The saved provider response in the report distinguishes generated audio from simulated or unavailable voice output.

**00:20:13.233 — Record a synthetic attendance response**

The coordinator records an administrative attendance response against a simulated local-outbox message. We choose Confirmed Attendance, identify the responder category, and add a note that this is a synthetic training response. Refreshing confirms the saved status. This does not establish real attendance and does not automatically change a clinical decision or cancel an appointment.


## 17. Ask OncoBrief: sources and boundaries

**00:20:37.767 — Ask a factual administrative question**

Ask OncoBrief supports constrained questions about the selected record set. We ask which documents are available for this patient. Read the actual response and any cited sources. A provider may be unavailable, and the assistant should then disclose its limits rather than manufacture a record answer.

**00:20:58.967 — Retrieve an institutional reference**

An institutional checklist query is reference retrieval. Here the indexed reference is explicitly a synthetic hospital SOP. It can help staff find document-preparation rules, but it is not a patient-specific prescription and is not evidence of affiliation with a national institution. Inspect the returned citations before relying on the answer.

**00:21:21.833 — Demonstrate the clinical boundary**

We deliberately ask for chemotherapy advice to test the boundary. The assistant must not prescribe or choose treatment. Its actual response is shown here. Clinical assessment and decisions belong to the treating professionals; this system supports source inspection and operational preparation.


## 18. Operational analytics and telemetry export

**00:21:40.933 — Understand the denominators**

Analytics reports stored operational measurements. Registered patients and consultation-ready rate describe the current tenant. The pilot target is a goal, not a measured outcome. Every patient in this recording is synthetic, including the newly registered training patient: the interface may call that row live because its fixture flag is false. That label does not make it real hospital data.

**00:22:07.533 — Read ingestion and evidence metrics**

Document counts measure stored sources. The promotion-gate rate compares promoted candidates with completed promoted or rejected candidates; it does not prove medical correctness. Verified and unverified facts describe review state, while quarantined records need attention. Conflicts, missing records, and open or overdue tasks identify record-preparation work. These counts are sensitive to the configured data and filters.

**00:22:33.967 — Read OPD and continuity measurements**

OPD utilization compares active or completed appointments with stored slots for the selected clinic date. Backfill counts confirmed walk-ins and accepted offers, not suggestions. Continuity metrics describe stored caregivers, messages, and attendance responses. Empty denominators should not be read as success. This synthetic exercise establishes application behavior, not improved hospital capacity or patient outcomes.

**00:22:59.200 — Download and inspect real telemetry**

The CSV export downloads the current tenant’s telemetry as a real file. We inspect its header and rows in the browser from the downloaded content. The file can support an operational review, but its labels, population, and synthetic origin must accompany any chart or presentation made from it.


## 19. Audit, roles, administration, and security

**00:23:21.233 — Audit the human decisions**

We sign in as the synthetic auditor and open the patient audit. Events record actors, timestamps, actions, and reasons where required. The ledger hash-chain indicator checks internal integrity. A successful chain check is useful tamper evidence; it is not proof against every administrator compromise or a certification of medical accuracy.

**00:23:44.100 — Observe a read-only role**

The auditor has no evidence-verification permission in the shared role policy. However, this timeline still displays Verify buttons to the auditor: a visible permission-related interface issue. The verification server action contains its own permission check. We separately test direct patient-registration access and receive a forbidden response. Visible buttons and actual authority must be assessed separately.

**00:24:09.033 — Records officer versus clinician approval**

The records officer can inspect and review source evidence, upload documents, and resolve conflicts under the role policy. Packet approval remains clinician-only. We open the ready patient’s packet to see the available controls, then Continuity. The permissions report distinguishes declared policy, page checks, and observed browser behavior; it does not treat a hidden button as sufficient security.

**00:24:34.800 — Administration overview and staff roles**

The organization administrator has a separate administration area. Its overview summarizes active staff, clinician profiles, departments, facilities, and invitations. Staff and Roles supports authorized membership management. We inspect these pages without creating credentials, sending invitations, or changing anyone’s role. Administrative authority does not grant evidence attestation or clinician approval in the role matrix.

**00:24:59.700 — Clinicians, departments, and facilities**

The clinician directory stores specialty, professional profile, and operational details. Departments and facilities configure service lines and hospital sites. These settings shape assignment and scheduling. They must be maintained by authorized administrators; the software does not infer clinical credentials or decide which specialty is appropriate for a patient.

**00:25:21.733 — Settings and security assumptions**

Hospital Settings and Audit provides governance information and system activity. The implementation uses hashed server-side sessions, role checks, tenant-scoped transactions, and PostgreSQL row-level security. These are implemented mechanisms, not a production compliance certification. This local tutorial does not validate deployment encryption, backups, penetration testing, or live hospital integration.

**00:25:46.367 — Invitation-based staff activation**

Staff activation is a separate public page reached through an authorized invitation link. Without a valid invitation token, the page cannot activate an account. We show that boundary without exposing a token, creating a password, or sending an external invitation. Administrators should follow the hospital’s controlled onboarding process for real staff.


## 20. One connected patient workflow and recap

**00:26:09.633 — Register one new training patient**

We finish with one connected workflow for a new synthetic patient, Leela Demo Training. Starting from registration keeps identity, documents, evidence, scheduling, and audit attached to the same chart. We enter only administrative details and an explicit training label. There is no diagnosis or treatment decision in this registration.

**00:26:32.067 — Upload and inspect the same patient’s source**

In this patient’s Sources tab we upload an original synthetic referral PDF using the tested standard text encoding. We wait, refresh, and open Evidence Journey. The referral contains an explicit appointment date and a document-to-bring instruction. OncoBrief must preserve those statements as source-linked candidates rather than inventing new instructions.

**00:26:54.500 — Inspect and verify the documented appointment**

We select the recorded appointment, open its supporting passage, and compare the extracted date with the referral. The Verify action records that the transcription matches this synthetic source. After refresh the verified state remains. This confirms a documented administrative statement, not the clinical appropriateness of the appointment.

**00:27:16.100 — Inspect gaps and create grounded work**

Record Map still shows missing required categories. We create a retrieval task from an actual gap and give it a clear training title. No source conflict was detected for this new referral, so there is no contradiction to resolve here; the earlier reconciliation chapter demonstrated that separate workflow. We do not manufacture a conflict or waive a medical requirement.

**00:27:42.700 — Assign the task and prepare a packet draft**

We switch to the coordinator account, assign this task with an explicit ownership confirmation, and create a packet draft for the same patient. The draft includes unresolved preparation work. We leave it for clinician review because missing documents remain. Packet approval was demonstrated separately on the complete ready fixture; readiness and approval are different decisions.

**00:28:07.633 — Book the consultation and open OPD**

We book a synthetic appointment for this patient with Dr. Rao and a training room, then confirm its presence in the directory. We open OPD Flow for the same date to inspect the operational queue. The booking does not make a blocked record ready. Staff still need to retrieve and verify the missing documents before relying on preparation completeness.

**00:28:34.233 — Register administrative tumor-board preparation**

The training meeting can include the same patient as an administrative preparation case. We assign a presenter and leave staging and clinical consensus pending. This connects the chart to the meeting agenda without deciding that a tumor board is medically indicated. Required clinical review remains a handoff to qualified professionals.

**00:28:57.100 — Compose and approve a local continuity message**

The coordinator composes a reminder from this patient’s verified appointment fact. We then switch to the clinician to review and approve the synthetic draft. The visible delivery mode is a simulated local outbox. We do not send external communications or claim that a real patient received this reminder.

**00:29:19.133 — Follow the trail into analytics and audit**

Finally, analytics reflects stored operational changes, and the auditor can inspect this patient’s event history. We verify the ledger chain and view the registration, document, review, task, packet, appointment, and communication activity that this workflow produced. Auditability explains who acted and when; it does not turn incomplete records into clinical truth.

**00:29:42.400 — Recap and next steps**

What This Is explains the governing boundary. Start with the correct patient, inspect the original sources, verify transcriptions, keep contradictions visible, and assign grounded administrative work. Review packets and communications before approval. OncoBrief organizes source-verified information and care-team operations; qualified people retain clinical judgment and responsibility. All records and outcomes shown in this tutorial are synthetic training examples.
