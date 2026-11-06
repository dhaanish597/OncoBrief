# Chatbot model retirement — November 6, 2026

## Symptom and confirmed provider failure

The deployed evaluator chatbot reports that it cannot reach the language service, including for “What documents are missing?”. Its state-graph trace completes but the answer is an availability error.

A bounded synthetic probe using the owner's locally configured NVIDIA credential reproduced the failure without transmitting patient records:

| Probe | Result |
|---|---|
| GET `https://integrate.api.nvidia.com/v1/models` | HTTP 200, 84 listed model IDs |
| POST chat completion, `meta/llama-3.2-11b-vision-instruct` | HTTP 410; provider explicitly says model reached end of life at `2026-11-05T09:00:00Z` |
| POST chat completion, `meta/llama-3.3-70b-instruct` | HTTP 410; unsuitable replacement |
| POST chat completion, `nvidia/nemotron-3.5-bolt-e4b` | HTTP 200, response “OK”, 721 ms in the recorded probe |

This distinguishes an unavailable model from an invalid local credential or general inability to reach NVIDIA. The deployment source did not set `NVIDIA_MODEL`, so its old image used the retired built-in default. The current AWS task/environment must still be checked for drift after login; local evidence alone does not establish the live task's exact configuration.

## Source remediation

- Updated adapter default and `.env.example` to the successfully probed model.
- Added an explicit Terraform `nvidia_model` setting to the hackathon task environment. Future deployment/model changes remain visible and reviewable.
- On provider failure, the assistant now defaults to the existing deterministic, authorized-ledger synthesis, with source citations, original review states and the same grounding checks. Callers can explicitly disable this recovery. It does not generate medical advice or fabricate missing records.
- Added provider HTTP status to safe operational telemetry. Questions, answers, keys and patient identifiers are not logged.
- Reproduced both regressions before fixing them; replacement-default and retired-model fallback tests then passed (33 focused tests total). Medical refusals and cross-tenant guards remain covered.

The deterministic state-graph trace is operational execution metadata; it is not proof that a language model returned an answer. The provider mode identifies whether the response came from the model or the deterministic ledger path.

A further local end-to-end synthetic assistant request with the replacement model returned `grounded=true`, `providerMode=nvidia-llm`, two source citations and no availability error in 956 ms. This proves the source fix against the real provider, not the still-unverified AWS task.

## Live remediation completed

The owner authorized AWS login and reauthenticated the existing default profile. Read-only ECS inspection confirmed the live task was revision 3, used the recorded November 5 image, and had no NVIDIA model override.

The reviewed Terraform plan changed only the hackathon ECS task definitions and web service. It was applied successfully. ECS now has one running task on `oncobrief-hackathon-web:4`, rollout **COMPLETED**, with `NVIDIA_MODEL=nvidia/nemotron-3.5-bolt-e4b`. The bootstrap task definition advanced to revision 4 but no bootstrap job was run. The image remains `release-36cf2ba08912`; this is a model-configuration correction, not deployment of the newly integrated application source.

Live Chromium verification through the actual gated evaluator site and assistant UI passed:

| Question/check | HTTP | Result |
|---|---|---|
| What documents are missing? | 200 | `missing_documents_question`, grounded, `nvidia-llm`, two source citations, no availability error |
| Latest pathology report | 200 | `evidence_question`, grounded, `nvidia-llm`, four source citations, no availability error |
| Treatment-change advice | 200 | `unsupported_medical_question`, deterministic refusal, zero source disclosures |

These checks appended synthetic assistant conversations only. No patient message was sent. The evaluator gate and existing application authentication remained enabled. No database reset, migration, restore, or unrelated AWS resource change occurred.

A refreshed Terraform plan after rollout exited 0 with no changes.

The prior task/image identity is recorded in the November 5 report. Any future model change should be probed first and applied through the same isolated Terraform environment; reverting to the retired model would restore the failure. Source fallback/telemetry improvements are published on main and require a later application-image rollout to become active in AWS.

No API key, evaluator password or AWS credential is stored in this report.
