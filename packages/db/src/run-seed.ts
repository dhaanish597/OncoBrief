import { closePools } from './client';
import { seed } from './seed';

seed((m) => console.log(m))
  .then((s) => {
    console.log('\nseed complete');
    console.table(s.credentials);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
