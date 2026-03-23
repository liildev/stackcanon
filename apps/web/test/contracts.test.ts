import assert from "node:assert/strict";
import test from "node:test";
import type {
  DoctorJsonOutput,
  GenerateJsonOutput,
  InitJsonOutput,
  RevertJsonOutput,
  SyncJsonOutput
} from "@stackcanon/contracts";
import {
  parseCliPayload,
  summarizeDoctorPayload,
  summarizeGeneratePayload,
  summarizeInitPayload,
  summarizeRevertPayload,
  summarizeSyncPayload
} from "../src/contracts.js";

test("parseCliPayload accepts doctor payloads", () => {
  const payload = {
    schemaVersion: 1,
    root: "/tmp/demo",
    summary: {
      status: "warning",
      totalFindings: 1,
      infoCount: 0,
      warningCount: 1,
      errorCount: 0
    },
    context: {
      packageManager: "pnpm",
      qualityProviderState: "none",
      docsSyncState: "none"
    },
    detection: {
      root: "/tmp/demo",
      packageManager: "pnpm",
      dependencies: {},
      hasTypeScript: false,
      frameworks: [],
      hasBiome: false,
      hasOxlint: false,
      hasUltracite: false,
      qualityVersions: {},
      configFiles: {},
      existingFiles: {}
    },
    findings: [
      {
        code: "framework_missing_supported",
        category: "framework",
        severity: "error",
        message: "No supported framework detected."
      }
    ]
  } satisfies DoctorJsonOutput;

  const parsed = parseCliPayload(JSON.stringify(payload));

  assert.equal("findings" in parsed, true);
  assert.deepEqual(summarizeDoctorPayload(parsed as DoctorJsonOutput), ["[error] framework_missing_supported: No supported framework detected."]);
});

test("parseCliPayload accepts init payloads", () => {
  const payload = {
    schemaVersion: 1,
    command: "init",
    mode: "plan",
    plan: {
      detection: {
        root: "/tmp/demo",
        packageManager: "pnpm",
        dependencies: {},
        hasTypeScript: false,
        frameworks: [],
        hasBiome: false,
        hasOxlint: false,
        hasUltracite: false,
        qualityVersions: {},
        configFiles: {},
        existingFiles: {}
      },
      framework: "nuxt",
      quality: "ultracite",
      actions: ["Resolve framework"],
      backups: [".stackcn/backups/<timestamp>/"],
      files: [],
      packageJson: {
        devDependencies: [],
        scripts: []
      },
      manifest: {
        schemaVersion: 1,
        framework: "nuxt",
        quality: "ultracite",
        packageManager: "pnpm",
        qualityVersions: {},
        detectedFrameworks: [],
        generatedFiles: []
      },
      aiEngine: {
        sourceDirectory: "ai",
        targets: []
      }
    }
  } satisfies InitJsonOutput;

  const parsed = parseCliPayload(JSON.stringify(payload));

  assert.equal("command" in parsed, true);
  assert.deepEqual(summarizeInitPayload(parsed as InitJsonOutput), ["nuxt / ultracite", "actions=1", "files=0"]);
});

test("parseCliPayload accepts add payloads through the setup contract", () => {
  const payload = {
    schemaVersion: 1,
    command: "add",
    mode: "plan",
    plan: {
      detection: {
        root: "/tmp/demo",
        packageManager: "pnpm",
        dependencies: {},
        hasTypeScript: false,
        frameworks: [],
        hasBiome: false,
        hasOxlint: false,
        hasUltracite: false,
        qualityVersions: {},
        configFiles: {},
        existingFiles: {}
      },
      framework: "nuxt",
      quality: "biome",
      actions: ["Resolve quality override"],
      backups: [".stackcn/backups/<timestamp>/"],
      files: [],
      packageJson: {
        devDependencies: [],
        scripts: []
      },
      manifest: {
        schemaVersion: 1,
        framework: "nuxt",
        quality: "biome",
        packageManager: "pnpm",
        qualityVersions: {},
        detectedFrameworks: [],
        generatedFiles: []
      },
      aiEngine: {
        sourceDirectory: "ai",
        targets: []
      }
    }
  } satisfies InitJsonOutput;

  const parsed = parseCliPayload(JSON.stringify(payload));

  assert.equal("command" in parsed, true);
  assert.deepEqual(summarizeInitPayload(parsed as InitJsonOutput), ["nuxt / biome", "actions=1", "files=0"]);
});

test("parseCliPayload accepts generate payloads", () => {
  const payload = {
    schemaVersion: 1,
    command: "generate",
    root: "/tmp/demo",
    target: "ai-rulez",
    result: {
      writtenFiles: ["AGENTS.md", "CLAUDE.md"],
      skippedFiles: [],
      aiRulezCommand: "node_modules/.bin/ai-rulez generate"
    }
  } satisfies GenerateJsonOutput;

  const parsed = parseCliPayload(JSON.stringify(payload));

  assert.equal("command" in parsed, true);
  assert.deepEqual(summarizeGeneratePayload(parsed as GenerateJsonOutput), [
    "target=ai-rulez",
    "written=2",
    "skipped=0",
    "aiRulez=node_modules/.bin/ai-rulez generate"
  ]);
});

test("parseCliPayload accepts sync payloads", () => {
  const payload = {
    schemaVersion: 1,
    command: "sync",
    root: "/tmp/demo",
    result: {
      root: "/tmp/demo",
      syncedSources: [
        {
          id: "next-docs",
          url: "https://nextjs.org/docs",
          contentType: "text/html",
          rawPath: ".stackcn/sources/raw/next-docs.html",
          normalizedPath: ".stackcn/sources/normalized/next-docs.md"
        }
      ],
      indexPath: ".stackcn/sources/index.json"
    }
  } satisfies SyncJsonOutput;

  const parsed = parseCliPayload(JSON.stringify(payload));

  assert.equal("command" in parsed, true);
  assert.deepEqual(summarizeSyncPayload(parsed as SyncJsonOutput), [
    "sources=1",
    "index=.stackcn/sources/index.json"
  ]);
});

test("parseCliPayload accepts revert payloads", () => {
  const payload = {
    schemaVersion: 1,
    command: "revert",
    root: "/tmp/demo",
    result: {
      backupDirectory: ".stackcn/backups/2026-03-22T00-00-00-000Z",
      restoredPaths: ["package.json"],
      removedPaths: ["AGENTS.md", "ai/config.yaml"],
      warnings: []
    }
  } satisfies RevertJsonOutput;

  const parsed = parseCliPayload(JSON.stringify(payload));

  assert.equal("command" in parsed, true);
  assert.deepEqual(summarizeRevertPayload(parsed as RevertJsonOutput), [
    "backup=.stackcn/backups/2026-03-22T00-00-00-000Z",
    "restored=1",
    "removed=2"
  ]);
});
