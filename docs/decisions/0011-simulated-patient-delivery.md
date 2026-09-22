# 0011 — Patient delivery is simulated in the prototype

**Status:** Accepted
**Date:** 2026-09-22

## Context

`cancer_track.md` proposes a patient companion on WhatsApp Business API and
IVR, with Sarvam Saaras ASR and Bulbul TTS for voice. Research §3.2 argues that
closing the loop on the patient side is one of the highest-leverage
differentiators.

The constraints for this window: no WhatsApp Business account, no IVR provider,
no Sarvam credentials, and a demo that runs offline on a laptop. Demo step 18
in `CLAUDE.md` asks only to *"Preview a verified administrative patient
message."*

`CLAUDE.md` also says: *"Do not use fake success states to hide broken backend
behavior."* A mocked WhatsApp integration showing a green "Sent" tick would be
exactly that.

## Decision

Implement **compose → approve → simulated deliver → audit** in full. Specify
real delivery adapters; do not implement them.

- `DeliveryPort` has one implementation in this window,
  `SimulatedDeliveryAdapter`, which writes a `message_outbox` row with
  `simulated = true` and renders it in an in-app patient-inbox preview pane.
- The UI labels simulated delivery unambiguously. There is no "Sent" state that
  implies a message reached a patient.
- `whatsapp`, `sms`, `ivr` and `email` adapters are declared in the port and
  left unimplemented, with that fact stated in the README and the `/about`
  page.
- Voice (ASR/TTS) is **out of scope entirely** for this window.

The safety machinery around messaging is fully real, because that is the part
worth demonstrating:

- Messages render from `message_template` rows — `{{variable}}` placeholders
  only, no free LLM prose, with the template's own approval recorded.
- `message_variable_source` traces **every substituted variable** to a specific
  `evidence_fact` (and thence to a page and bounding box) or an `admin_task`.
- **A variable whose backing fact is not `verified` or `corrected` blocks
  approval.** The system cannot tell a patient something the record has not
  confirmed.
- Approval requires `message:approve`, which is clinician-only.
- Template content is administrative only: appointment logistics, documents to
  bring, records-office contact, and preparation instructions already written
  in an approved document. No clinical guidance.

## Alternatives considered

**Real WhatsApp Business API.** Rejected: no account, provisioning takes longer
than the build window, and it would make the demo depend on network and a
vendor sandbox. It also introduces real PHI transmission, which a hackathon
prototype should not do.

**Mock WhatsApp adapter that displays "Sent".** Rejected as a fake success
state, explicitly forbidden. The distinction between this and the chosen option
is one word in the UI, and that word is the difference between honest and not.

**Email via SMTP.** Rejected: superficially easy, but it is the wrong channel
for the target population, needs credentials, and emitting real email from a
prototype holding synthetic patient data is an unforced error.

**Skip patient communication entirely.** Rejected: demo step 18 requires it,
and research §3.2 identifies the closed loop as a real differentiator. The
approval gate and variable provenance are the novel parts, and both are fully
implementable offline.

**Include voice ASR/TTS.** Rejected: no credentials, and a voice layer whose
intent accuracy cannot be evaluated is a liability in a safety-critical demo.
The 95% voice-intent figure in `cancer_track.md` is among the numbers research
§4.4 discredits.

## Consequences

**Positive.** The entire loop is demonstrable offline. The genuinely novel
part — every variable in a patient-facing message traceable to verified
evidence, with unverified sources blocking approval — is fully built and
testable. Adding a real channel later is one adapter behind an unchanged port.
No PHI leaves the machine.

**Negative.** Judges see a preview pane, not a phone. The multilingual claim is
demonstrated by rendering templates in `en` and `hi` rather than by delivering
them. Real-channel constraints (WhatsApp template pre-approval, 24-hour session
windows, delivery receipts, opt-out handling) are unexplored and will surface
as real work later.

**Neutral.** `message_outbox` already models delivery attempts, external refs
and failures, so the schema does not change when a real adapter lands.
