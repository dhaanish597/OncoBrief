import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getMigratorPool } from "./client";
import { getDelivery, getOcr, getExtractor, getStorage } from "./container";
import { hashPassword } from "./services/auth";
import {
  confirmDocumentType,
  createDocument,
  ingestDocument,
} from "./services/documents";
import { verifyEvidence } from "./services/ledger";
import {
  composeMessage,
  approveMessage,
  createMessageTemplate,
  deliverMessage,
} from "./services/messages";
import { createPacket } from "./services/packets";
import { createTask } from "./services/tasks";
import {
  assignChecklist,
  computeAndPersistReadiness,
  evaluateAndPersistGaps,
} from "./services/twin";
import {
  DEMO_001_DOCS,
  DEMO_002_DOCS,
  DEMO_003_DOCS,
  type FixtureDoc,
} from "./fixtures";

/**
 * Demo seed (architecture §25.2).
 *
 * The data must contain the problem. DEMO-001 is a fragmented referral whose
 * documents genuinely disagree about the surgery date; DEMO-002 is a verified
 * fact reopened by a later document; DEMO-003 is ready. Everything is badged
 * `is_demo_fixture`. Synthetic patients only — no real patient data.
 */

const DEMO_PASSWORD = "oncobrief-demo";

const TRUNCATE_TABLES = [
  "caregiver_contact",
  "opd_appointment_slot",
  "opd_waitlist_entry",
  "guideline_document",
  "guideline_span",
  "studio_artifact",
  "organization",
  "app_user",
  "membership",
  "session",
  "user_totp",
  "patient",
  "patient_identifier",
  "document",
  "document_page",
  "text_span",
  "extraction_candidate",
  "evidence_fact",
  "evidence_span_link",
  "ledger_entry",
  "evidence_state",
  "conflict_set",
  "conflict_member",
  "checklist_template",
  "checklist_item",
  "patient_checklist",
  "record_gap",
  "record_readiness_snapshot",
  "admin_task",
  "task_event",
  "consultation_packet",
  "packet_item",
  "message_template",
  "patient_message",
  "message_variable_source",
  "message_outbox",
  "audit_event",
  "idempotency_key",
  "extension_grant",
  "timeline_event",
  "ledger_counter",
  "audit_counter",
];

export interface SeedSummary {
  orgs: string[];
  patients: string[];
  documents: number;
  facts: number;
  conflicts: number;
  gaps: number;
  tasks: number;
  packets: number;
  messages: number;
  credentials: { email: string; password: string; role: string }[];
}

/** Explicit local fixture-database opt-in is required even from tests and CLI wrappers. */
function requireDemoResetEnvironment(): string {
  if (!["development", "test"].includes(process.env.NODE_ENV ?? ""))
    throw new Error("demo_reset_requires_development");
  if (process.env.ONCOBRIEF_DEMO_MODE !== "true")
    throw new Error("demo_reset_requires_explicit_demo_mode");
  const expected = process.env.DEMO_DATABASE_NAME;
  if (!expected) throw new Error("demo_reset_requires_database_name");
  const urls = ["DATABASE_URL", "DATABASE_MIGRATOR_URL"].map((key) => {
    let url: URL;
    try {
      url = new URL(process.env[key] ?? "");
    } catch {
      throw new Error("demo_reset_invalid_database_url");
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.search
    )
      throw new Error("demo_reset_requires_loopback");
    if (decodeURIComponent(url.pathname.slice(1)) !== expected)
      throw new Error("demo_reset_database_mismatch");
    return url;
  });
  if ((urls[0]!.port || "5432") !== (urls[1]!.port || "5432"))
    throw new Error("demo_reset_database_mismatch");
  return expected;
}

async function truncateAll(
  client: PoolClient,
  expectedDatabase: string,
): Promise<void> {
  const actual = await client.query<{ database_name: string }>(
    "SELECT current_database() AS database_name",
  );
  if (actual.rows[0]?.database_name !== expectedDatabase)
    throw new Error("demo_reset_database_mismatch");
  // Hold the guard and truncate in the same transaction; concurrent identity inserts cannot race it.
  await client.query(
    `LOCK TABLE ${TRUNCATE_TABLES.join(", ")} IN ACCESS EXCLUSIVE MODE`,
  );
  const unsafe = await client.query<{ non_synthetic: boolean }>(`
    SELECT EXISTS(SELECT 1 FROM organization WHERE is_demo_fixture IS DISTINCT FROM true)
        OR EXISTS(SELECT 1 FROM app_user WHERE is_demo_fixture IS DISTINCT FROM true)
        OR EXISTS(SELECT 1 FROM membership WHERE is_demo_fixture IS DISTINCT FROM true)
        OR EXISTS(SELECT 1 FROM patient WHERE is_demo_fixture IS DISTINCT FROM true) AS non_synthetic`);
  if (unsafe.rows[0]?.non_synthetic !== false)
    throw new Error("demo_reset_non_synthetic_data");
  await client.query(
    `TRUNCATE ${TRUNCATE_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function seed(
  log: (m: string) => void = () => {},
): Promise<SeedSummary> {
  const expectedDatabase = requireDemoResetEnvironment();
  const client = await getMigratorPool().connect();
  try {
    await client.query("BEGIN");
    log("checking isolated synthetic database before reset");
    await truncateAll(client, expectedDatabase);

    // --- orgs ---------------------------------------------------------------
    const org1 = (
      await client.query<{ id: string }>(
        `INSERT INTO organization (slug, name, is_demo_fixture, abdm_hip_id, abdm_hiu_id, hfr_facility_id)
         VALUES ('rci','Regional Cancer Institute (Demo)', true, 'IN010000001', 'IN010000001-HIU', 'HFR-RCI-01')
         RETURNING id`,
      )
    ).rows[0]!.id;
    const org2 = (
      await client.query<{ id: string }>(
        `INSERT INTO organization (slug, name, is_demo_fixture, abdm_hip_id, abdm_hiu_id, hfr_facility_id)
         VALUES ('northgate','Northgate General Hospital (Demo)', true, 'IN020000002', 'IN020000002-HIU', 'HFR-NGH-02')
         RETURNING id`,
      )
    ).rows[0]!.id;
    log(`orgs: rci=${org1} northgate=${org2}`);

    // --- users --------------------------------------------------------------
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const staff: { email: string; name: string; role: string; org: string }[] =
      [
        {
          email: "dr.rao@rci.demo",
          name: "Dr. Meera Rao",
          role: "clinician",
          org: org1,
        },
        {
          email: "coord.anita@rci.demo",
          name: "Anita Joseph",
          role: "coordinator",
          org: org1,
        },
        {
          email: "records.deepak@rci.demo",
          name: "Deepak Nair",
          role: "records_officer",
          org: org1,
        },
        {
          email: "admin.sys@rci.demo",
          name: "System Admin",
          role: "org_admin",
          org: org1,
        },
        {
          email: "auditor.k@rci.demo",
          name: "Kavya Iyer",
          role: "auditor",
          org: org1,
        },
        {
          email: "dr.menon@northgate.demo",
          name: "Dr. Arun Menon",
          role: "clinician",
          org: org2,
        },
      ];
    const userId: Record<string, string> = {};
    for (const s of staff) {
      const u = (
        await client.query<{ id: string }>(
          `INSERT INTO app_user (email, display_name, password_hash, is_demo_fixture)
           VALUES ($1,$2,$3,true) RETURNING id`,
          [s.email, s.name, passwordHash],
        )
      ).rows[0]!.id;
      userId[s.email] = u;
      await client.query(
        `INSERT INTO membership (org_id, user_id, role, is_demo_fixture) VALUES ($1,$2,$3,true)`,
        [s.org, u, s.role],
      );
    }
    log(`users: ${staff.length}`);

    // --- checklist template (human-authored, version-pinned) ----------------
    const tpl = (
      await client.query<{ id: string }>(
        `INSERT INTO checklist_template (org_id, code, name, version, care_context, authored_by)
         VALUES ($1,'new_patient_intake','New patient intake',1,'new_patient_intake',$2) RETURNING id`,
        [org1, userId["records.deepak@rci.demo"]],
      )
    ).rows[0]!.id;

    const items: [string, string, string, string, number, string][] = [
      [
        "referral_note",
        "Referral note",
        "referral_letter",
        "required",
        1,
        "Records office requires the referral note for new-patient intake.",
      ],
      [
        "pathology",
        "Pathology report",
        "pathology_report",
        "required",
        2,
        "Records office requires the pathology report on file before the consultation.",
      ],
      [
        "radiology",
        "Radiology report",
        "radiology_report",
        "expected",
        3,
        "Radiology reports are expected to be present for surgical review.",
      ],
      [
        "treatment_summary",
        "Treatment summary",
        "treatment_summary",
        "expected",
        4,
        "A treatment summary is expected where treatment has been recorded.",
      ],
      [
        "insurance_authorization",
        "Insurance authorization",
        "insurance_authorization",
        "required",
        5,
        "Insurance authorization is administratively required for a new-patient intake packet at this hospital.",
      ],
      [
        "consent",
        "Consent form",
        "consent_form",
        "expected",
        6,
        "A consent form is expected but may be completed on the day.",
      ],
    ];
    for (const [code, label, docType, kind, ordinal, rationale] of items) {
      await client.query(
        `INSERT INTO checklist_item (org_id, template_id, code, label, required_document_type, requirement_kind, ordinal, rationale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [org1, tpl, code, label, docType, kind, ordinal, rationale],
      );
    }

    // Three NCG-aligned oncology document-readiness workflow templates
    const tplIntake = (
      await client.query<{ id: string }>(
        `INSERT INTO checklist_template (org_id, code, name, version, care_context, authored_by)
         VALUES ($1,'ncg_oncology_intake','NCG Oncology Intake Document Readiness',1,'oncology_referral_intake',$2) RETURNING id`,
        [org1, userId["records.deepak@rci.demo"]],
      )
    ).rows[0]!.id;

    const intakeItems: [string, string, string, string, number, string][] = [
      [
        "referral_letter",
        "Referral letter",
        "referral_letter",
        "required",
        1,
        "Verified referral letter required for cancer care intake.",
      ],
      [
        "pathology_report",
        "Histopathology / IHC report",
        "pathology_report",
        "required",
        2,
        "Biopsy or histopathology confirmation required for oncology consultation.",
      ],
      [
        "radiology_report",
        "Staging radiology report",
        "radiology_report",
        "expected",
        3,
        "Baseline cross-sectional staging imaging report expected.",
      ],
      [
        "insurance_auth",
        "Insurance pre-authorization",
        "insurance_authorization",
        "required",
        4,
        "Administrative pre-authorization required before admission.",
      ],
      [
        "consent",
        "Intake consent form",
        "consent_form",
        "expected",
        5,
        "Records processing consent form expected.",
      ],
    ];
    for (const [
      code,
      label,
      docType,
      kind,
      ordinal,
      rationale,
    ] of intakeItems) {
      await client.query(
        `INSERT INTO checklist_item (org_id, template_id, code, label, required_document_type, requirement_kind, ordinal, rationale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [org1, tplIntake, code, label, docType, kind, ordinal, rationale],
      );
    }

    const tplTumorBoard = (
      await client.query<{ id: string }>(
        `INSERT INTO checklist_template (org_id, code, name, version, care_context, authored_by)
         VALUES ($1,'ncg_tumor_board_prep','NCG Tumor Board Case Preparation',1,'tumor_board_review',$2) RETURNING id`,
        [org1, userId["records.deepak@rci.demo"]],
      )
    ).rows[0]!.id;

    const tbItems: [string, string, string, string, number, string][] = [
      [
        "pathology_report",
        "Pathology / Biopsy report",
        "pathology_report",
        "required",
        1,
        "Confirmed tissue pathology required for multidisciplinary discussion.",
      ],
      [
        "radiology_report",
        "Diagnostic imaging report",
        "radiology_report",
        "required",
        2,
        "Current CT/MRI/PET imaging report required for tumor staging review.",
      ],
      [
        "operative_note",
        "Prior surgical operative note",
        "operative_note",
        "expected",
        3,
        "Surgical documentation expected if resection was previously performed.",
      ],
      [
        "treatment_summary",
        "Systemic therapy / Radiation summary",
        "treatment_summary",
        "expected",
        4,
        "Prior oncology treatment summary expected for refractory cases.",
      ],
    ];
    for (const [code, label, docType, kind, ordinal, rationale] of tbItems) {
      await client.query(
        `INSERT INTO checklist_item (org_id, template_id, code, label, required_document_type, requirement_kind, ordinal, rationale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [org1, tplTumorBoard, code, label, docType, kind, ordinal, rationale],
      );
    }

    const tplFollowup = (
      await client.query<{ id: string }>(
        `INSERT INTO checklist_template (org_id, code, name, version, care_context, authored_by)
         VALUES ($1,'ncg_oncology_followup','NCG Longitudinal Oncology Follow-up',1,'oncology_surveillance',$2) RETURNING id`,
        [org1, userId["records.deepak@rci.demo"]],
      )
    ).rows[0]!.id;

    const followupItems: [string, string, string, string, number, string][] = [
      [
        "treatment_summary",
        "Completed treatment summary",
        "treatment_summary",
        "required",
        1,
        "Baseline treatment completion summary required for surveillance.",
      ],
      [
        "lab_report",
        "Serial interval laboratory report",
        "lab_report",
        "required",
        2,
        "Recent blood counts and surveillance labs required.",
      ],
      [
        "radiology_report",
        "Follow-up imaging scan",
        "radiology_report",
        "expected",
        3,
        "Periodic restaging or surveillance imaging expected.",
      ],
      [
        "prescription",
        "Active medication prescription",
        "prescription",
        "expected",
        4,
        "Maintenance systemic therapy or supportive medication record.",
      ],
    ];
    for (const [
      code,
      label,
      docType,
      kind,
      ordinal,
      rationale,
    ] of followupItems) {
      await client.query(
        `INSERT INTO checklist_item (org_id, template_id, code, label, required_document_type, requirement_kind, ordinal, rationale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [org1, tplFollowup, code, label, docType, kind, ordinal, rationale],
      );
    }
    log(`checklist templates: base + 3 oncology templates created`);

    // --- message templates (administrative only) ----------------------------
    const bodyEn = `Your appointment is on {{appointment_date}} at {{appointment_location}}. Please bring the documents listed in your records office letter. For help call {{records_office_phone}}.`;
    const tplEn = await createMessageTemplate(client, {
      orgId: org1,
      code: "appointment_reminder",
      locale: "en",
      bodyTemplate: bodyEn,
      allowedVariables: [
        "appointment_date",
        "appointment_location",
        "records_office_phone",
      ],
      approvedBy: userId["dr.rao@rci.demo"]!,
    });
    const tplHi = await createMessageTemplate(client, {
      orgId: org1,
      code: "appointment_reminder",
      locale: "hi",
      bodyTemplate: `आपका अपॉइंटमेंट {{appointment_date}} को {{appointment_location}} में है। कृपया अपने रिकॉर्ड कार्यालय के पत्र में बताए गए दस्तावेज़ लाएँ। सहायता के लिए {{records_office_phone}} पर कॉल करें।`,
      allowedVariables: [
        "appointment_date",
        "appointment_location",
        "records_office_phone",
      ],
      approvedBy: userId["dr.rao@rci.demo"]!,
    });

    // --- patients -----------------------------------------------------------
    const patient = async (
      code: string,
      name: string,
      mrn: string,
      lastConsultationDate?: string | null,
      primaryTemplateId?: string,
    ): Promise<string> => {
      const p = (
        await client.query<{ id: string }>(
          `INSERT INTO patient (org_id, demo_code, display_name, last_consultation_date, is_demo_fixture)
           VALUES ($1,$2,$3,$4,true) RETURNING id`,
          [org1, code, name, lastConsultationDate ?? null],
        )
      ).rows[0]!.id;
      await client.query(
        `INSERT INTO patient_identifier (org_id, patient_id, system, value) VALUES ($1,$2,'mrn',$3), ($1,$2,'demo',$4)`,
        [org1, p, mrn, code],
      );
      await assignChecklist(client, {
        orgId: org1,
        patientId: p,
        templateId: tpl,
        userId: userId["records.deepak@rci.demo"]!,
      });
      if (primaryTemplateId) {
        await assignChecklist(client, {
          orgId: org1,
          patientId: p,
          templateId: primaryTemplateId,
          userId: userId["records.deepak@rci.demo"]!,
        });
      }
      return p;
    };

    const p1 = await patient(
      "DEMO-001",
      "DEMO-001 — Fragmented referral",
      "SUN-448120",
      "2025-07-05",
      tplIntake,
    );
    const p2 = await patient(
      "DEMO-002",
      "DEMO-002 — Staleness",
      "RCI-2025-0044",
      "2025-06-10",
      tplTumorBoard,
    );
    const p3 = await patient(
      "DEMO-003",
      "DEMO-003 — Ready",
      "READY-1001",
      "2025-03-15",
      tplFollowup,
    );

    // A second org patient with a colliding MRN, for the isolation tests.
    const pOther = (
      await client.query<{ id: string }>(
        `INSERT INTO patient (org_id, demo_code, display_name, is_demo_fixture) VALUES ($1,'DEMO-001','DEMO-001 — Other tenant',true) RETURNING id`,
        [org2],
      )
    ).rows[0]!.id;
    await client.query(
      `INSERT INTO patient_identifier (org_id, patient_id, system, value) VALUES ($1,$2,'mrn','SUN-448120')`,
      [org2, pOther],
    );

    // --- ingestion ----------------------------------------------------------
    const ingest = async (
      patientId: string,
      docs: FixtureDoc[],
    ): Promise<string[]> => {
      const ids: string[] = [];
      for (const d of docs) {
        const bytes = Buffer.from(d.pages.join("\n\n"), "utf8");
        const created = await createDocument(client, getStorage(), {
          orgId: org1,
          patientId,
          uploadedBy: userId["records.deepak@rci.demo"]!,
          filename: d.filename,
          mimeType: d.mimeType,
          content: bytes,
          sourceKind: d.sourceKind,
          documentDate: d.documentDate,
          issuingFacility: d.issuingFacility,
          recordOrigin: d.recordOrigin,
          isDemoFixture: true,
        });
        const result = await ingestDocument(
          client,
          { storage: getStorage(), ocr: getOcr(), extractor: getExtractor() },
          created.documentId,
          d.pages.map((text, i) => {
            const trimmed = text.trim();
            const spans = trimmed
              .split("\n")
              .map((line, idx) => ({
                granularity: "line" as const,
                index: idx,
                text: line.trim(),
                charStart: 0,
                charEnd: line.trim().length,
                bbox: {
                  x: 0.05,
                  y: Math.min(0.04 + idx * 0.055, 0.94),
                  w: Math.min(0.9, Math.max(0.05, line.trim().length * 0.008)),
                  h: 0.035,
                },
                confidence: 0.97,
              }))
              .filter((s) => s.text.length > 0);
            return {
              pageNumber: i + 1,
              widthPx: 1240,
              heightPx: 1754,
              plainText: trimmed,
              spans,
            };
          }),
        );
        ids.push(created.documentId);
        log(
          `  ingested ${d.filename}: status=${result.status} facts=${result.promoted}/${result.candidates} conflicts+${result.conflictsCreated}`,
        );
      }
      return ids;
    };

    log("ingesting DEMO-001");
    await ingest(p1, DEMO_001_DOCS);

    log("ingesting DEMO-002 (document 1, then verify, then document 2)");
    const d2 = await ingest(p2, [DEMO_002_DOCS[0]!]);
    void d2;

    // DEMO-002: verify the appointment fact, then let a later document reopen it.
    const appt2 = await client.query<{ id: string }>(
      `SELECT ef.id FROM evidence_fact ef
        WHERE ef.patient_id = $1 AND ef.fact_type = 'appointment.recorded'
        ORDER BY ef.created_at LIMIT 1`,
      [p2],
    );
    if (appt2.rows[0]) {
      await verifyEvidence(client, {
        factId: appt2.rows[0].id,
        actor: {
          kind: "human",
          userId: userId["dr.rao@rci.demo"]!,
          role: "clinician",
        },
      });
      log("DEMO-002: verified appointment fact from the June document");
    }
    log(
      "ingesting DEMO-002 remaining documents (reopens the verified fact, adds chemo & dated labs)",
    );
    await ingest(p2, DEMO_002_DOCS.slice(1));

    log("ingesting DEMO-003");
    await ingest(p3, DEMO_003_DOCS);

    // Confirm document types for every ingested document (advisory -> trusted).
    // This must run after all ingestion, because a requirement is only
    // satisfied by a document whose type a human has confirmed.
    for (const patientId of [p1, p2, p3]) {
      const docs = await client.query<{
        id: string;
        document_type: string | null;
      }>(
        `SELECT id, document_type FROM document WHERE patient_id = $1 AND type_confirmed_by IS NULL`,
        [patientId],
      );
      for (const d of docs.rows) {
        if (d.document_type) {
          await confirmDocumentType(client, {
            documentId: d.id,
            documentType: d.document_type,
            userId: userId["records.deepak@rci.demo"]!,
          });
        }
      }
    }

    // DEMO-003: verify every fact so the record is genuinely ready.
    const readyFacts = await client.query<{ id: string }>(
      `SELECT ef.id FROM evidence_fact ef
        LEFT JOIN evidence_state es ON es.evidence_fact_id = ef.id
       WHERE ef.patient_id = $1 AND coalesce(es.state,'extracted') = 'extracted'`,
      [p3],
    );
    for (const f of readyFacts.rows) {
      await verifyEvidence(client, {
        factId: f.id,
        actor: {
          kind: "human",
          userId: userId["dr.rao@rci.demo"]!,
          role: "clinician",
        },
      });
    }
    log(`DEMO-003: verified ${readyFacts.rows.length} facts`);

    // Re-run duplicate + conflict detection now that everything is ingested.
    const { detectNearDuplicates } = await import("./services/documents");
    const dupCount = await detectNearDuplicates(client, org1, p1);

    // --- gaps, tasks, readiness --------------------------------------------
    for (const patientId of [p1, p2, p3]) {
      await evaluateAndPersistGaps(client, org1, patientId);
    }

    // DEMO-001: create a source-backed retrieval task from a missing required gap.
    const missingGap = await client.query<{
      id: string;
      label: string;
      required_document_type: string;
    }>(
      `SELECT rg.id, ci.label, ci.required_document_type
         FROM record_gap rg JOIN checklist_item ci ON ci.id = rg.checklist_item_id
        WHERE rg.patient_id = $1 AND rg.status = 'missing' AND ci.requirement_kind = 'required'
        ORDER BY ci.ordinal LIMIT 1`,
      [p1],
    );
    let taskCount = 0;
    if (missingGap.rows[0]) {
      await createTask(client, {
        orgId: org1,
        patientId: p1,
        title: `Retrieve ${missingGap.rows[0].label}`,
        detail: `The workspace contains no ${missingGap.rows[0].required_document_type.replaceAll("_", " ")}. Request it from the patient or the issuing facility.`,
        taskKind: "retrieve_document",
        dueOn: "2025-08-18",
        origin: { kind: "record_gap", recordGapId: missingGap.rows[0].id },
        createdBy: userId["coord.anita@rci.demo"]!,
        assignedTo: userId["records.deepak@rci.demo"]!,
      });
      taskCount += 1;
    }

    let conflictCount = 0;
    const conflictRes = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM conflict_set WHERE org_id = $1`,
      [org1],
    );
    conflictCount = Number(conflictRes.rows[0]!.n);

    const conflictTask = await client.query<{ id: string }>(
      `SELECT id FROM conflict_set WHERE patient_id = $1 AND status = 'open' LIMIT 1`,
      [p1],
    );
    if (conflictTask.rows[0]) {
      await createTask(client, {
        orgId: org1,
        patientId: p1,
        title: "Clarify the recorded surgery date with the issuing facility",
        detail:
          "Two source documents disagree about the date of the procedure. Records office to confirm with the issuing facility.",
        taskKind: "clarify_with_facility",
        dueOn: "2025-08-20",
        origin: { kind: "conflict", conflictSetId: conflictTask.rows[0].id },
        createdBy: userId["coord.anita@rci.demo"]!,
      });
      taskCount += 1;
    }

    for (const patientId of [p1, p2, p3]) {
      await computeAndPersistReadiness(client, {
        orgId: org1,
        patientId,
        computedBy: userId["coord.anita@rci.demo"]!,
      });
    }

    // --- packet + message for the ready patient -----------------------------
    const packet = await createPacket(client, {
      orgId: org1,
      patientId: p3,
      encounterLabel: "Surgical oncology OPD — 15 May 2025",
      userId: userId["dr.rao@rci.demo"]!,
    });
    // Leave DEMO-003's packet in draft so the demo can approve it live.

    // DEMO-003 also gets a pre-approved message to show the outbox, composed
    // from a verified appointment fact.
    const appt3 = await client.query<{ id: string }>(
      `SELECT ef.id FROM evidence_fact ef
        JOIN evidence_state es ON es.evidence_fact_id = ef.id
       WHERE ef.patient_id = $1 AND ef.fact_type = 'appointment.recorded' AND es.state = 'verified'
       ORDER BY ef.created_at LIMIT 1`,
      [p3],
    );
    let messageCount = 0;
    if (appt3.rows[0]) {
      const composed = await composeMessage(client, {
        orgId: org1,
        patientId: p3,
        packetId: packet.packetId,
        templateId: tplEn,
        composedBy: userId["coord.anita@rci.demo"]!,
        variables: [
          {
            name: "appointment_date",
            value: "15 May 2025",
            source: { kind: "evidence", evidenceFactId: appt3.rows[0].id },
          },
          {
            name: "appointment_location",
            value: "Surgical Oncology OPD",
            source: { kind: "literal" },
          },
          {
            name: "records_office_phone",
            value: "+91 00000 00000",
            source: { kind: "literal" },
          },
        ],
      });
      const gate = await approveMessage(client, {
        messageId: composed.messageId,
        userId: userId["dr.rao@rci.demo"]!,
      });
      if (gate.ok) {
        await deliverMessage(client, getDelivery(), {
          messageId: composed.messageId,
          userId: userId["coord.anita@rci.demo"]!,
        });
        messageCount += 1;
      }
      // A Hindi draft, left unapproved, to demonstrate the multilingual surface.
      await composeMessage(client, {
        orgId: org1,
        patientId: p3,
        packetId: packet.packetId,
        templateId: tplHi,
        composedBy: userId["coord.anita@rci.demo"]!,
        variables: [
          {
            name: "appointment_date",
            value: "15 May 2025",
            source: { kind: "evidence", evidenceFactId: appt3.rows[0].id },
          },
          {
            name: "appointment_location",
            value: "सर्जिकल ऑन्कोलॉजी ओपीडी",
            source: { kind: "literal" },
          },
          {
            name: "records_office_phone",
            value: "+91 00000 00000",
            source: { kind: "literal" },
          },
        ],
      });
      messageCount += 1;
    }

    // --- Use Case 04 Fixtures: OPD Appointment Slots & Waitlist -------------
    log("seeding OPD slots and waitlist entries");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const clinicianId = userId["dr.rao@rci.demo"]!;
    const coordinatorId = userId["coord.anita@rci.demo"]!;

    await client.query(
      `INSERT INTO opd_appointment_slot
         (org_id, clinic_date, slot_start_time, slot_end_time, room_label, clinician_id, patient_id, token_number, status, priority_tag, updated_by, clinic_key, checked_in_at)
       VALUES
         ($1, $2, '09:00', '09:30', 'Room 1 — Medical Oncology', $3, $4, 'ONCO-01', 'scheduled', 'routine_followup', $5, 'rci-oncology-opd', NULL),
         ($1, $2, '09:30', '10:00', 'Room 1 — Medical Oncology', $3, $6, 'ONCO-02', 'checked_in', 'routine_followup', $5, 'rci-oncology-opd', (($2::date + time '09:30') AT TIME ZONE 'Asia/Kolkata')),
         ($1, $2, '10:00', '10:30', 'Room 1 — Medical Oncology', $3, $7, 'ONCO-03', 'scheduled', 'routine_followup', $5, 'rci-oncology-opd', NULL),
         ($1, $2, '10:30', '11:00', 'Room 1 — Medical Oncology', $3, NULL, NULL, 'vacant', 'routine_followup', $5, 'rci-oncology-opd', NULL)`,
      [org1, today, clinicianId, p1, coordinatorId, p2, p3],
    );

    await client.query(
      `INSERT INTO opd_waitlist_entry
         (org_id, patient_id, requested_date, priority_tag, status, clinic_key)
       VALUES
         ($1, $2, $3, 'routine_followup', 'waiting', 'rci-oncology-opd')`,
      [org1, p3, today],
    );

    // --- Use Case 05 Fixtures: Version-Pinned Institutional Oncology Guideline SOPs ---
    log("seeding institutional oncology guideline document and spans");
    const sopBody = `Institutional Standard Operating Procedure: Breast Oncology Referral Intake and Multidisciplinary Review.
Regional Cancer Institute — Institutional Oncology Protocol Committee.
Version: v2025.1. Synthetic demonstration reference only; not an institutional or NCG clinical protocol.

1. Pre-Consultation Document Checklist:
All newly referred breast oncology patients must have a confirmed histopathology report, baseline staging imaging, and prior surgical operative notes verified in the electronic record prior to multidisciplinary consultation.

2. Adjuvant Therapy Documentation:
Documented receptor status (ER, PR, HER2) must be recorded before systemic therapy planning. If slides are pending from external centres, an administrative retrieval task must be initiated.`;

    const sopSha256 = createHash("sha256").update(sopBody, "utf8").digest();

    const guideDocRes = await client.query<{ id: string }>(
      `INSERT INTO guideline_document
         (org_id, code, title, issuing_body, version_label, publication_date, content_sha256, uploaded_by)
       VALUES
         ($1, 'inst-sop-breast-intake', '[Synthetic Demo] Institutional SOP — Breast Oncology Intake and Document Readiness',
          'Synthetic Regional Cancer Institute — no institutional or NCG affiliation', 'v2025.1', '2025-01-15', $2, $3)
       RETURNING id`,
      [org1, sopSha256, clinicianId],
    );
    const guideDocId = guideDocRes.rows[0]!.id;

    await client.query(
      `INSERT INTO guideline_span
         (org_id, guideline_document_id, page_number, section_heading, span_index, verbatim_text, bbox_x, bbox_y, bbox_w, bbox_h, keywords)
       VALUES
         ($1, $2, 1, '1. Pre-Consultation Document Checklist', 0,
          'All newly referred breast oncology patients must have a confirmed histopathology report, baseline staging imaging, and prior surgical operative notes verified in the electronic record prior to multidisciplinary consultation.',
          0.08, 0.12, 0.84, 0.08, ARRAY['checklist', 'intake', 'histopathology', 'staging', 'referral']),
         ($1, $2, 1, '2. Adjuvant Therapy Documentation', 1,
          'Documented receptor status (ER, PR, HER2) must be recorded before systemic therapy planning. If slides are pending from external centres, an administrative retrieval task must be initiated.',
          0.08, 0.24, 0.84, 0.08, ARRAY['adjuvant', 'ihc', 'receptor', 'her2', 'er', 'pr'])`,
      [org1, guideDocId],
    );

    // --- Phase 5: Consented Family Caregiver Contacts ---
    log("seeding consented family caregiver contacts");
    await client.query(
      `INSERT INTO caregiver_contact
         (org_id, patient_id, full_name, relationship, phone_number, preferred_locale, prefers_voice_note, sync_reminders, consent_recorded_by, consent_recorded_at, is_active)
       VALUES
         ($1, $2, 'Sunita Sharma', 'Daughter / Family Caregiver', '+91 98765 43210', 'hi-IN', true, true, $3, now(), true),
         ($1, $4, 'Kavita Menon', 'Spouse / Primary Caregiver', '+91 98450 12345', 'en-IN', true, true, $3, now(), true)`,
      [org1, p1, coordinatorId, p3],
    );

    const factCount = Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM evidence_fact WHERE org_id = $1`,
          [org1],
        )
      ).rows[0]!.n,
    );
    const gapCount = Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM record_gap WHERE org_id = $1`,
          [org1],
        )
      ).rows[0]!.n,
    );
    const docCount = Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM document WHERE org_id = $1`,
          [org1],
        )
      ).rows[0]!.n,
    );

    log(`duplicates flagged: ${dupCount}`);

    await client.query("COMMIT");
    return {
      orgs: [org1, org2],
      patients: [p1, p2, p3],
      documents: docCount,
      facts: factCount,
      conflicts: conflictCount,
      gaps: gapCount,
      tasks: taskCount,
      packets: 1,
      messages: messageCount,
      credentials: staff.map((s) => ({
        email: s.email,
        password: DEMO_PASSWORD,
        role: s.role,
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
