const apiBaseInput = document.getElementById('apiBase');
const grantTokenInput = document.getElementById('grantToken');
const facilityInput = document.getElementById('facility');
const captureModeSelect = document.getElementById('captureMode');
const captureBtn = document.getElementById('captureBtn');
const statusBox = document.getElementById('status');

function setStatus(message, isError = false) {
  if (!statusBox) return;
  statusBox.style.display = 'block';
  statusBox.style.borderColor = isError ? '#b91c1c' : '#15803d';
  statusBox.style.color = isError ? '#991b1b' : '#166534';
  statusBox.textContent = message;
}

async function queryActiveTabCapture(mode) {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    return {
      origin: 'https://ehr.hospital.example',
      filename: 'ehr_extension_capture.txt',
      mimeType: 'text/plain',
      plainText:
        'EXTERNAL EHR REPORT CAPTURE\nFacility: Regional Cancer Centre\nDate: 2026-05-18\nHemoglobin: 11.6 g/dL\nPlatelets: 192000 /uL',
    };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error('No active browser tab found.');
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: 'ONCOBRIEF_EXTRACT_ACTIVE_REPORT', mode }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

if (captureBtn) {
  captureBtn.addEventListener('click', async () => {
    const apiBase = (apiBaseInput?.value || 'http://localhost:3000').replace(/\/+$/, '');
    const token = (grantTokenInput?.value || '').trim();
    const customFacility = (facilityInput?.value || '').trim();
    const scope = captureModeSelect?.value || 'capture:dom_text';

    if (!token.startsWith('ob_ext_')) {
      setStatus('Enter a valid single-use ob_ext_* grant token minted from OncoBrief.', true);
      return;
    }

    captureBtn.disabled = true;
    setStatus('Extracting active EHR report and transmitting with single-use grant…');

    try {
      const extracted = await queryActiveTabCapture(scope);
      const origin = customFacility || extracted.origin || 'https://ehr.hospital.example';

      const response = await fetch(`${apiBase}/api/v1/extension/capture`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'x-extension-origin': origin,
        },
        body: JSON.stringify({
          token,
          origin,
          scope,
          filename: extracted.filename || 'ehr_extension_capture.txt',
          mimeType: extracted.mimeType || 'text/plain',
          plainText: extracted.plainText,
          contentBase64: extracted.contentBase64,
          issuingFacility: origin,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      // Immediately clear single-use token from popup input
      if (grantTokenInput) grantTokenInput.value = '';
      setStatus(
        `Captured & ingested! Doc ID: ${payload.documentId.slice(0, 8)}… (${payload.promotedFacts} facts promoted, ${payload.subPacketCount} sub-packet(s)). Grant consumed.`,
      );
    } catch (err) {
      setStatus(`Capture failed: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      captureBtn.disabled = false;
    }
  });
}
