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

## Live remediation status

AWS CLI 2.38.2 reports that its short-lived login session has expired. The owner was asked to authorize `aws login` as explicitly required by the signing-in-to-aws skill. No live configuration change is claimed until authentication, plan review, rollout and actual evaluator-URL verification succeed.

After authentication:

1. Inspect the running hackathon ECS task definition's image/model setting and safe assistant error logs.
2. Use the dedicated hackathon Terraform environment and owner's private variable file; never apply stale dev state or reset the evaluator database.
3. Review the plan. A model-only environment update should replace the task definition/service deployment without touching unrelated infrastructure. Source recovery behavior additionally requires a new verified immutable image.
4. Wait for ECS stability and health. Verify source-grounded missing-document and record questions, a clinical-boundary refusal, and provider failure recovery through the gated evaluator URL.
5. Record the resulting image/task revision, actual model, test results and rollback identity. Keep the previous image/task definition for rollback.

No API key, evaluator password or AWS credential is stored in this report.
