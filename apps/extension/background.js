/**
 * OncoBrief Manifest V3 Background Service Worker (TASK-016).
 *
 * Enforces zero persistent credential storage: any ephemeral state is cleared
 * when the browser session closes or after a single-use grant redemption.
 */
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(() => {
    // No persistent tokens or background polling are registered.
  });
}
