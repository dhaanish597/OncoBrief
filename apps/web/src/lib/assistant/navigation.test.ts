import { describe, expect, it } from 'vitest';
import { buildNavigationTarget, getSection, matchSection, ONCOBRIEF_SECTIONS } from './navigation';

const PATIENT = '11111111-1111-1111-1111-111111111111';

describe('navigation registry', () => {
  it('only contains real OncoBrief patient sections', () => {
    const keys = ONCOBRIEF_SECTIONS.map((s) => s.key);
    expect(keys).toEqual([
      'evidence',
      'sources',
      'conflicts',
      'record-map',
      'tasks',
      'packet',
      'continuity',
      'audit',
    ]);
  });

  it('resolves a section to the real patient route', () => {
    expect(getSection('sources')?.route(PATIENT)).toBe(`/patients/${PATIENT}/sources`);
    expect(getSection('record-map')?.route(PATIENT)).toBe(`/patients/${PATIENT}/record-map`);
  });

  it('matches an evidence phrase to a section', () => {
    expect(matchSection('where can I see the evidence PDFs')?.key).toBe('sources');
    expect(matchSection('show me missing documents')?.key).toBe('record-map');
    expect(matchSection('where is the continuity view')?.key).toBe('continuity');
  });

  it('builds navigation targets from logical actions only', () => {
    const sources = buildNavigationTarget('OPEN_SOURCES', PATIENT);
    expect(sources?.href).toBe(`/patients/${PATIENT}/sources`);

    const missing = buildNavigationTarget('OPEN_MISSING_DOCUMENTS', PATIENT);
    expect(missing?.href).toBe(`/patients/${PATIENT}/record-map`);
  });

  it('builds a document/evidence link with stable ids, never an external URL', () => {
    const target = buildNavigationTarget('OPEN_EVIDENCE', PATIENT, {
      documentId: '22222222-2222-2222-2222-222222222222',
      evidenceFactId: '33333333-3333-3333-3333-333333333333',
      pageNumber: 4,
    });
    expect(target?.href).toBe(
      `/patients/${PATIENT}/sources/22222222-2222-2222-2222-222222222222?fact=33333333-3333-3333-3333-333333333333&page=4`,
    );
    expect(target?.href.startsWith('/patients/')).toBe(true);
  });
});
