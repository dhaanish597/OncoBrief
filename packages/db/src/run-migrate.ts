import { closePools } from './client.js';
import { migrate } from './migrate.js';

migrate((m) => console.log(m))
  .then((applied) => {
    console.log(applied.length === 0 ? 'database up to date' : `applied ${applied.length} migration(s)`);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
