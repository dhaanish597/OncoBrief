export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export interface PrivacyShieldState {
  appState: AppStateStatus;
  isVeiled: boolean;
}

/**
 * Pure state machine evaluating privacy veil activation
 * Fails safe (veils screen) on 'inactive' (task switcher preview) and 'background'
 */
export function evaluatePrivacyShieldState(status: AppStateStatus): PrivacyShieldState {
  return {
    appState: status,
    isVeiled: status === 'inactive' || status === 'background',
  };
}
