/**
 * OncoBrief Scoped EHR Capture Content Script (TASK-016).
 *
 * Extracts only user-selected or active clinical report text / embedded FHIR JSON
 * when explicitly invoked by the popup action. Never runs automatic background scraping.
 */
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'ONCOBRIEF_EXTRACT_ACTIVE_REPORT') {
      return false;
    }

    const origin = window.location.origin || 'https://ehr.hospital.example';
    const mode = message.mode || 'capture:dom_text';

    if (mode === 'capture:fhir_json') {
      const fhirScript =
        document.querySelector('script[type="application/fhir+json"]') ||
        document.querySelector('pre[data-fhir-bundle]');
      const jsonText = fhirScript ? fhirScript.textContent || '' : document.body.innerText || '';
      sendResponse({
        origin,
        filename: 'ehr_captured_bundle.json',
        mimeType: 'application/fhir+json',
        plainText: jsonText.trim(),
      });
      return true;
    }

    const selection = window.getSelection ? String(window.getSelection()).trim() : '';
    const reportContainer =
      document.querySelector('[data-ehr-report], main, article') || document.body;
    const textContent = selection || (reportContainer ? reportContainer.innerText : '') || '';

    sendResponse({
      origin,
      filename: `${(document.title || 'ehr_report').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48)}.txt`,
      mimeType: 'text/plain',
      plainText: textContent.trim(),
    });
    return true;
  });
}
