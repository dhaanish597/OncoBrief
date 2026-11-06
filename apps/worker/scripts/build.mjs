import { build } from 'esbuild';
import { rmSync, mkdirSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reproducible worker bundle for AWS Lambda (ADR 0015).
 *
 * Two entry points:
 *   src/lambda.ts -> index.js  (SQS handlers: index.documentIngestHandler,
 *                               index.ocrResultHandler)
 *   src/admin.ts   -> admin.js  (admin.adminHandler: migrate / seed-demo / info)
 *
 * All application and workspace code is bundled. `pg` is pure JavaScript and is
 * bundled too. The one native module the wider package exports — argon2 — is
 * excluded by the narrow `@oncobrief/db/worker` barrel and, defensively, marked
 * external here so a future accidental import fails loudly at invoke rather
 * than producing a Windows binary inside a Linux function.
 */

const here = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(here, '..');
const repoRoot = resolve(workerRoot, '..', '..');
const outdir = resolve(repoRoot, 'infra', 'build', 'worker');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// Keep the optional Lambda path aligned with the on-disk CLI migrations.
const migrationNames = readdirSync(resolve(repoRoot, 'packages/db/migrations')).filter(name => name.endsWith('.sql')).sort();
writeFileSync(resolve(workerRoot, 'src/bundled-migrations.ts'), [
  "import type { MigrationFile } from '@oncobrief/db/worker';",
  ...migrationNames.map((name, i) => `import m${i} from '../../../packages/db/migrations/${name}';`),
  'export const BUNDLED_MIGRATIONS: MigrationFile[] = [',
  ...migrationNames.map((name, i) => `  { name: '${name}', sql: m${i} },`),
  '];', '',
].join('\n'));
copyFileSync(resolve(repoRoot, 'packages/db/certs/rds-global-bundle.pem'), resolve(outdir, 'rds-global-bundle.pem'));

const result = await build({
  entryPoints: [
    { in: resolve(workerRoot, 'src', 'lambda.ts'), out: 'index' },
    { in: resolve(workerRoot, 'src', 'admin.ts'), out: 'admin' },
  ],
  outdir,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  metafile: true,
  logLevel: 'info',
  loader: { '.sql': 'text' },
  external: ['pg-native', '@node-rs/argon2'],
  banner: { js: '/* OncoBrief worker bundle — ADR 0015. Generated; do not edit. */' },
});

if (result.errors.length > 0) {
  console.error('worker build failed');
  process.exit(1);
}
console.log(`worker bundle written to ${outdir}`);
