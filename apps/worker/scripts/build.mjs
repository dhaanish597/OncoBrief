import { build } from 'esbuild';
import { rmSync, mkdirSync } from 'node:fs';
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
