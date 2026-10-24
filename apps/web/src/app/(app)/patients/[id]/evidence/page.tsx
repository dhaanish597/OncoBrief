import {
  getPatient,
  getTimeline,
  listDocuments,
  listTasks,
  getLongitudinalReview,
  listRecordMap,
} from '@oncobrief/db';
import { withSession } from '@/lib/session';
import { EvidenceViewContainer } from '@/components/EvidenceViewContainer';

/**
 * The Evidence Journey. This page is a *view over the Evidence Ledger* — there
 * is no independent timeline store. Every row is a fact with its current
 * derived state, its confidence band, and a link to the page it came from.
 */
export default async function EvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; view?: string }>;
}) {
  const { id } = await params;
  const { filter, view } = await searchParams;

  const data = await withSession(async (q) => {
    const timeline = await getTimeline(q, id);
    const patient = await getPatient(q, id);
    const docs = await listDocuments(q, id);
    const tasks = await listTasks(q, id);
    const review = await getLongitudinalReview(q, id);
    const map = await listRecordMap(q, id);
    return {
      timeline,
      patient,
      docsCount: docs.length,
      tasksCount: tasks.length,
      review,
      readinessBand: map.readiness?.band ?? null,
      missingRequiredCount: map.gaps.filter(
        (g) => g.status === 'missing' && g.requirementKind === 'required',
      ).length,
    };
  });

  const {
    timeline,
    patient,
    docsCount,
    tasksCount,
    review,
    readinessBand,
    missingRequiredCount,
  } = data;

  const currentFilter = filter ?? 'all';
  const currentView = view ?? 'timeline';

  const defaultInterval = {
    baselineDate: null,
    newDocumentsCount: 0,
    newFacts: [],
    reopenedOrNewConflictsCount: 0,
    pendingInvestigations: [],
    documentedInstructions: [],
  };

  return (
    <EvidenceViewContainer
      patientId={id}
      patientCode={patient?.demoCode || 'DEMO-001'}
      timeline={timeline}
      interval={review?.interval ?? defaultInterval}
      labFlowsheet={review?.labFlowsheet ?? []}
      medicationHistory={review?.medicationHistory ?? []}
      readinessBand={readinessBand}
      missingRequiredCount={missingRequiredCount}
      docsCount={docsCount}
      tasksCount={tasksCount}
      currentFilter={currentFilter}
      currentView={currentView}
    />
  );
}
