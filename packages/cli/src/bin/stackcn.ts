#!/usr/bin/env node

import process from "node:process";
import { runCli } from "../index.js";

runCli(process.argv.slice(2), process.cwd())
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`stackcn failed: ${message}`);
    process.exitCode = 1;
  });
