import { closePools } from './client';
import { seedAws } from './seed-aws';

seedAws((m) => console.log(m))
  .then((r) => {
    console.log('\nAWS seed complete');
    console.log(`  org:      ${r.orgId}`);
    console.log(`  patient:  ${r.patientId}`);
    console.log(`  documents enqueued: ${r.documentIds.length} -> ${r.queue}`);
    console.log('  Run the worker (pnpm dev:worker) and watch document_ingestion_job. This path needs Textract.');
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
