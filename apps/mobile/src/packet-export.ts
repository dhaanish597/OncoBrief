import type { State } from './domain';

export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildExportHtml(state: State): string {
  const patientName = escapeHtml(state.patientName || 'Patient');
  const mrn = escapeHtml(state.mrn || 'N/A');
  const diagnosis = escapeHtml(state.diagnosis || 'Not specified');
  const stage = escapeHtml(state.journeyStage || 'Not specified');
  const notes = escapeHtml(state.notes || '');

  const questionsHtml = (state.questions || [])
    .map(
      (q, idx) => `
    <li style="margin-bottom: 8px;">
      <strong>Q${idx + 1}:</strong> ${escapeHtml(q.text)}
      <span style="color: #666; font-size: 12px;">(${q.answered ? 'Discussed' : 'To discuss'})</span>
    </li>`,
    )
    .join('');

  const selectedDocs = (state.documents || []).filter((d) =>
    (state.packSelected || []).includes(d.id),
  );

  const documentsHtml = selectedDocs
    .map(
      (d) => `
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 8px;">${escapeHtml(d.name)}</td>
      <td style="padding: 8px;">${escapeHtml(d.category)}</td>
      <td style="padding: 8px;">${escapeHtml(d.date || 'Unknown')}</td>
      <td style="padding: 8px;">${escapeHtml(d.facility)}</td>
      <td style="padding: 8px;">${d.clinicianVerified ? 'Clinician Verified' : 'Pending Review'}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OncoBrief Consultation Preparation Packet - ${patientName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #101F43; max-width: 800px; margin: 0 auto; padding: 24px; }
    h1 { color: #101F43; border-bottom: 2px solid #315A91; padding-bottom: 8px; }
    h2 { color: #315A91; margin-top: 24px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #E8EEF5; color: #315A91; }
    .disclaimer { background: #FFFBEB; border: 1px solid #F59E0B; padding: 12px; border-radius: 6px; font-size: 13px; color: #92400E; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; background: #F3F4F6; padding: 8px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>OncoBrief Consultation Preparation Packet</h1>
  <div class="disclaimer">
    <strong>Notice:</strong> This preparation packet is assembled by the patient for consultation readiness. It contains source-anchored records, questions, and personal notes. It is not an automated medical recommendation or diagnosis.
  </div>

  <h2>Patient Overview</h2>
  <p>
    <strong>Name:</strong> ${patientName}<br>
    <strong>MRN:</strong> ${mrn}<br>
    <strong>Verified Diagnosis:</strong> ${diagnosis}<br>
    <strong>Journey Stage:</strong> ${stage}
  </p>

  <h2>Priority Consultation Questions (${state.questions?.length || 0})</h2>
  ${questionsHtml ? `<ol>${questionsHtml}</ol>` : '<p>No questions recorded.</p>'}

  <h2>Selected Source Reports (${selectedDocs.length})</h2>
  ${
    selectedDocs.length
      ? `<table>
      <thead>
        <tr>
          <th>Report Name</th>
          <th>Category</th>
          <th>Date</th>
          <th>Issuing Facility</th>
          <th>Verification</th>
        </tr>
      </thead>
      <tbody>
        ${documentsHtml}
      </tbody>
    </table>`
      : '<p>No reports selected.</p>'
  }

  <h2>Personal Symptom & Preparation Notes</h2>
  <p>${notes ? notes : '<em>No notes recorded.</em>'}</p>

  <hr style="margin-top: 32px; border: 0; border-top: 1px solid #ddd;">
  <p style="font-size: 11px; color: #666; text-align: center;">
    Generated securely via OncoBrief Patient Portal. All facts require source provenance verification.
  </p>
</body>
</html>`;
}
