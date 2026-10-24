#!/usr/bin/env node
import { main } from "../packages/db/src/demo-readiness";

main().catch((err) => {
  console.error(
    "Demo preparation failed:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
