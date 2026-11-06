import React from 'react';

export type RuntimeProviderMode =
  | 'live'
  | 'sandbox'
  | 'fallback'
  | 'simulated_chime'
  | 'simulated_loopback';

export interface ProviderModeBadgeProps {
  capability: string;
  mode: RuntimeProviderMode;
  providerName: string;
  detail?: string;
  verificationTier?: string;
}

const MODE_STYLES: Record<
  RuntimeProviderMode,
  { badgeText: string; className: string }
> = {
  live: {
    badgeText: 'LIVE PROVIDER',
    className: 'border-emerald-700 bg-emerald-50 text-emerald-900',
  },
  sandbox: {
    badgeText: 'SANDBOX GATEWAY',
    className: 'border-blue-700 bg-blue-50 text-blue-900',
  },
  fallback: {
    badgeText: 'LOCAL DETERMINISTIC FALLBACK',
    className: 'border-amber-700 bg-[#fdf3df] text-amber-950',
  },
  simulated_chime: {
    badgeText: 'AUDIBLE TONE CHIME / BROWSER SPEECH FALLBACK',
    className: 'border-amber-700 bg-[#fdf3df] text-amber-950',
  },
  simulated_loopback: {
    badgeText: 'SIMULATED LOCAL LOOPBACK',
    className: 'border-amber-700 bg-[#fdf3df] text-amber-950',
  },
};

/**
 * Runtime Provider & Simulation Transparency Badge (`TASK-014`, `REQ-049`).
 *
 * Ensures clinicians and evaluators always see whether an AI / external integration
 * is running against a live cloud provider, an external sandbox gateway, a local
 * deterministic engine, or a simulated loopback / audible tone chime.
 */
export function ProviderModeBadge({
  capability,
  mode,
  providerName,
  detail,
  verificationTier,
}: ProviderModeBadgeProps) {
  const style = MODE_STYLES[mode] ?? MODE_STYLES.fallback;
  const tooltip = detail ?? `${capability}: ${providerName} (${style.badgeText})${verificationTier ? ` — ${verificationTier}` : ''}`;
  return (
    <span
      data-testid={`provider-mode-badge-${capability.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      data-provider-mode={mode}
      className={`mono inline-flex flex-wrap items-center gap-1.5 border px-2 py-0.5 text-[10px] font-medium ${style.className}`}
      title={tooltip}
    >
      <span className="font-semibold uppercase">{capability}:</span>
      <span>{providerName}</span>
      <span className="opacity-75">·</span>
      <span className="font-semibold uppercase">{style.badgeText}</span>
      {verificationTier ? (
        <>
          <span className="opacity-75">·</span>
          <span className="opacity-90">{verificationTier}</span>
        </>
      ) : null}
    </span>
  );
}
