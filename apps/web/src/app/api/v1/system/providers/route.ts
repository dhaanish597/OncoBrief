import { NextResponse } from 'next/server';

export type VerificationTier =
  | 'Live Verified'
  | 'Credentials Configured (Not Live Verified)'
  | 'Contract/Sandbox Verified (Not Live Verified)'
  | 'Local Fallback / Not Live Verified'
  | 'Simulated Loopback (Not Live Verified)'
  | 'Simulated Tone Chime (Not Live Verified)'
  | 'Code Complete (Not Live Verified)';

export interface ProviderCapabilityStatus {
  port:
    | 'ocr'
    | 'extractor'
    | 'llm_copilot'
    | 'tts'
    | 'stt'
    | 'translation'
    | 'abdm_gateway'
    | 'outbound_delivery';
  label: string;
  configuredDriver: string;
  activeProviderName: string;
  activeMode:
    | 'live'
    | 'sandbox'
    | 'fallback'
    | 'simulated_chime'
    | 'simulated_loopback';
  credentialsPresent: boolean;
  verificationTier: VerificationTier;
  disclosureNote: string;
}

function getRuntimeProviderStatuses(): ProviderCapabilityStatus[] {
  const sarvamKey = Boolean(process.env['SARVAM_API_KEY']?.trim());
  const awsKeys = Boolean(
    process.env['AWS_ACCESS_KEY_ID']?.trim() &&
      process.env['AWS_SECRET_ACCESS_KEY']?.trim(),
  );
  const bedrockModel = Boolean(process.env['BEDROCK_MODEL_ID']?.trim());
  const nvidiaKey = Boolean(process.env['NVIDIA_API_KEY']?.trim());
  const abdmSandbox =
    process.env['ABDM_DRIVER'] === 'sandbox' &&
    Boolean(process.env['ABDM_CLIENT_ID']?.trim() && process.env['ABDM_CLIENT_SECRET']?.trim());
  const deliveryLive =
    process.env['SIMULATE_DELIVERY_ONLY'] !== '1' &&
    Boolean(
      process.env['DELIVERY_WEBHOOK_URL']?.trim() ||
        (process.env['TWILIO_ACCOUNT_SID']?.trim() &&
          process.env['TWILIO_AUTH_TOKEN']?.trim() &&
          process.env['TWILIO_FROM_NUMBER']?.trim()),
    );

  const ocrDriver = (process.env['OCR_DRIVER'] ?? 'auto').toLowerCase();
  const ocrLiveSarvam = (ocrDriver === 'sarvam' || ocrDriver === 'auto') && sarvamKey;
  const ocrLiveTextract = ocrDriver === 'textract' && awsKeys;

  const extractorDriver = (
    process.env['EXTRACTION_DRIVER'] ??
    process.env['EXTRACTOR_DRIVER'] ??
    'auto'
  ).toLowerCase();
  const extractorLiveBedrock =
    (extractorDriver === 'bedrock' || extractorDriver === 'auto') &&
    awsKeys &&
    bedrockModel;

  return [
    {
      port: 'ocr',
      label: 'Document & Image OCR',
      configuredDriver: ocrDriver,
      activeProviderName: ocrLiveSarvam
        ? 'Sarvam Vision OCR'
        : ocrLiveTextract
          ? 'AWS Textract OCR'
          : 'LocalMultimodalOcrAdapter (PDF + PNG IDAT Pixel OCR)',
      activeMode: ocrLiveSarvam || ocrLiveTextract ? 'live' : 'fallback',
      credentialsPresent: ocrLiveSarvam || ocrLiveTextract,
      verificationTier:
        ocrLiveSarvam || ocrLiveTextract
          ? 'Credentials Configured (Not Live Verified)'
          : 'Local Fallback / Not Live Verified',
      disclosureNote:
        ocrLiveSarvam || ocrLiveTextract
          ? 'Cloud OCR credentials configured; falls back to LocalMultimodalOcrAdapter on network error.'
          : 'Running local deterministic PDF stream + raster pixel OCR engine.',
    },
    {
      port: 'extractor',
      label: 'Candidate Fact Extractor',
      configuredDriver: extractorDriver,
      activeProviderName: extractorLiveBedrock
        ? 'AWS Bedrock LLM Extractor + Rule Fallback'
        : nvidiaKey
          ? 'NVIDIA NIM Extractor + Rule Fallback'
          : 'RuleBasedExtractor (Deterministic Regex/Table)',
      activeMode: extractorLiveBedrock || nvidiaKey ? 'live' : 'fallback',
      credentialsPresent: extractorLiveBedrock || nvidiaKey,
      verificationTier:
        extractorLiveBedrock || nvidiaKey
          ? 'Credentials Configured (Not Live Verified)'
          : 'Local Fallback / Not Live Verified',
      disclosureNote:
        'All extracted candidates must pass the deterministic Two-Stage Provenance Span Gate before entering the Evidence Ledger.',
    },
    {
      port: 'llm_copilot',
      label: 'Ask OncoBrief Co-Pilot Synthesis',
      configuredDriver: bedrockModel ? 'bedrock' : nvidiaKey ? 'nvidia' : 'deterministic',
      activeProviderName:
        awsKeys && bedrockModel
          ? 'AWS Bedrock Claude / Llama Grounded Synthesis'
          : nvidiaKey
            ? 'NVIDIA NIM Grounded Synthesis'
            : 'Deterministic Ledger & Guideline Citation Synthesizer',
      activeMode: (awsKeys && bedrockModel) || nvidiaKey ? 'live' : 'fallback',
      credentialsPresent: (awsKeys && bedrockModel) || nvidiaKey,
      verificationTier:
        (awsKeys && bedrockModel) || nvidiaKey
          ? 'Credentials Configured (Not Live Verified)'
          : 'Local Fallback / Not Live Verified',
      disclosureNote:
        'Every response is restricted to non-clinical record readiness and verified [E#] / [G#] citations.',
    },
    {
      port: 'tts',
      label: '11-Locale Spoken Voice Preview (TTS)',
      configuredDriver: sarvamKey ? 'sarvam-bulbul-v3' : 'simulated-wav-and-web-speech',
      activeProviderName: sarvamKey
        ? 'Sarvam Bulbul v3 Multilingual TTS'
        : 'Audible Multi-Tone PCM WAV Chime + Browser Web Speech Synthesis',
      activeMode: sarvamKey ? 'live' : 'simulated_chime',
      credentialsPresent: sarvamKey,
      verificationTier: sarvamKey
        ? 'Credentials Configured (Not Live Verified)'
        : 'Simulated Tone Chime (Not Live Verified)',
      disclosureNote: sarvamKey
        ? 'Live Sarvam Bulbul v3 neural speech synthesis active across 11 Indic locales.'
        : 'SARVAM_API_KEY not set: server returns an audible multi-tone PCM WAV verification chime while the browser invokes native Web Speech API synthesis for spoken locale preview.',
    },
    {
      port: 'stt',
      label: 'Clinician Voice Dictation (STT)',
      configuredDriver: sarvamKey ? 'sarvam-saaras-v3' : 'browser-speech-recognition',
      activeProviderName: sarvamKey
        ? 'Sarvam Saaras v3 ASR'
        : 'Browser SpeechRecognition / Deterministic Transcript Fallback',
      activeMode: sarvamKey ? 'live' : 'fallback',
      credentialsPresent: sarvamKey,
      verificationTier: sarvamKey
        ? 'Credentials Configured (Not Live Verified)'
        : 'Local Fallback / Not Live Verified',
      disclosureNote:
        'Voice transcripts are ingested as unverified source text and never bypass human review.',
    },
    {
      port: 'translation',
      label: '11-Locale Administrative Translation',
      configuredDriver: sarvamKey ? 'sarvam-mayura-v1' : 'curated-11-locale-phrasebook',
      activeProviderName: sarvamKey
        ? 'Sarvam Mayura v1 + 11-Locale Phrasebook Fallback'
        : 'Deterministic 11-Locale Native-Script Administrative Phrasebook',
      activeMode: sarvamKey ? 'live' : 'fallback',
      credentialsPresent: sarvamKey,
      verificationTier: sarvamKey
        ? 'Credentials Configured (Not Live Verified)'
        : 'Local Fallback / Not Live Verified',
      disclosureNote:
        'Translates only verified administrative appointment and document-checklist reminders across 11 Indic scripts.',
    },
    {
      port: 'abdm_gateway',
      label: 'ABDM HIE-CM v3 & Fidelius ECDH Gateway',
      configuredDriver: process.env['ABDM_DRIVER'] ?? 'simulated',
      activeProviderName: abdmSandbox
        ? 'ABDM Sandbox Gateway (HttpAbdmGatewayAdapter)'
        : 'SimulatedAbdmGatewayAdapter + Real Fidelius X25519 ECDH Crypto',
      activeMode: abdmSandbox ? 'sandbox' : 'simulated_loopback',
      credentialsPresent: abdmSandbox,
      verificationTier: abdmSandbox
        ? 'Contract/Sandbox Verified (Not Live Verified)'
        : 'Simulated Loopback (Not Live Verified)',
      disclosureNote: abdmSandbox
        ? 'Connected to ABDM HIE-CM V3 Sandbox endpoints.'
        : 'Local loopback simulation of patient grant with real X25519 ECDH + HKDF-SHA256 + AES-256-GCM encryption/decryption.',
    },
    {
      port: 'outbound_delivery',
      label: 'Outbound SMS / WhatsApp Continuity Delivery',
      configuredDriver: process.env['DELIVERY_DRIVER'] ?? 'simulated',
      activeProviderName: deliveryLive
        ? 'WebhookDeliveryAdapter (Twilio / Signed HTTP Webhook)'
        : 'SimulatedDeliveryAdapter (Local Outbox Only — No External SMS Sent)',
      activeMode: deliveryLive ? 'live' : 'simulated_loopback',
      credentialsPresent: deliveryLive,
      verificationTier: deliveryLive
        ? 'Credentials Configured (Not Live Verified)'
        : 'Simulated Loopback (Not Live Verified)',
      disclosureNote: deliveryLive
        ? 'Live outbound webhook / Twilio messaging configured.'
        : 'Simulated delivery only: messages are recorded in message_outbox without contacting external phone numbers.',
    },
  ];
}

/**
 * Runtime Provider Health & Transparency Endpoint (`TASK-014` & `TASK-026`, `REQ-049`, `REQ-059`).
 */
export async function GET(): Promise<NextResponse> {
  const providers = getRuntimeProviderStatuses();
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      totalPorts: providers.length,
      liveConfiguredCount: providers.filter((p) => p.activeMode === 'live').length,
      sandboxConfiguredCount: providers.filter((p) => p.activeMode === 'sandbox').length,
      fallbackOrSimulatedCount: providers.filter(
        (p) =>
          p.activeMode === 'fallback' ||
          p.activeMode === 'simulated_chime' ||
          p.activeMode === 'simulated_loopback',
      ).length,
    },
    providers,
  });
}
