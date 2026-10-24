#!/usr/bin/env node
// Compatibility entry point: keep one implementation and one set of safety guards.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const result = spawnSync(
  "pnpm",
  ["exec", "tsx", "tools/prepare-demo.ts", ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
if (result.error) console.error("Unable to start demo readiness checker.");
process.exitCode = result.status ?? 1;
