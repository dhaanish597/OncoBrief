import { closePools } from './client.js';
import { seed } from './seed.js';

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
