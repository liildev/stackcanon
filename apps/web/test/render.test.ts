import assert from "node:assert/strict";
import test from "node:test";
import type {
  DoctorJsonOutput,
  GenerateJsonOutput,
  InitJsonOutput,
  RevertJsonOutput,
  SyncJsonOutput
} from "@stackcanon/contracts";
import { renderAppPage } from "../src/index.js";

test("renderAppPage shows doctor report details", () => {
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

  const html = renderAppPage({ parsedPayload: payload });

  assert.match(html, /Doctor Report/);
  assert.match(html, /framework_missing_supported/);
  assert.match(html, /No supported framework detected\./);
});

test("renderAppPage shows generate report details", () => {
  const payload = {
    schemaVersion: 1,
    command: "generate",
    root: "/tmp/demo",
    target: "all",
    result: {
      writtenFiles: ["AGENTS.md", "CLAUDE.md"],
      skippedFiles: ["README.md"]
    }
  } satisfies GenerateJsonOutput;

  const html = renderAppPage({ parsedPayload: payload });

  assert.match(html, /Generate Output/);
  assert.match(html, /AGENTS\.md/);
  assert.match(html, /README\.md/);
});

test("renderAppPage shows add plan details", () => {
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

  const html = renderAppPage({ parsedPayload: payload });

  assert.match(html, /Add plan/);
  assert.match(html, /nuxt/);
  assert.match(html, /biome/);
});

test("renderAppPage shows revert warnings", () => {
  const payload = {
    schemaVersion: 1,
    command: "revert",
    root: "/tmp/demo",
    result: {
      backupDirectory: ".stackcn/backups/2026-03-22T00-00-00-000Z",
      restoredPaths: ["package.json"],
      removedPaths: ["AGENTS.md"],
      warnings: ["Backup metadata is missing."]
    }
  } satisfies RevertJsonOutput;

  const html = renderAppPage({ parsedPayload: payload });

  assert.match(html, /Revert Output/);
  assert.match(html, /Backup metadata is missing\./);
  assert.match(html, /package\.json/);
});

test("renderAppPage shows sync report details", () => {
  const payload = {
    schemaVersion: 1,
    command: "sync",
    root: "/tmp/demo",
    result: {
      root: "/tmp/demo",
      syncedSources: [
        {
          id: "nuxt-guide",
          url: "https://nuxt.com/docs/guide",
          contentType: "text/html",
          rawPath: ".stackcn/sources/raw/nuxt-guide.html",
          normalizedPath: ".stackcn/sources/normalized/nuxt-guide.md"
        }
      ],
      indexPath: ".stackcn/sources/index.json"
    }
  } satisfies SyncJsonOutput;

  const html = renderAppPage({ parsedPayload: payload });

  assert.match(html, /Sync Output/);
  assert.match(html, /nuxt-guide/);
  assert.match(html, /\.stackcn\/sources\/normalized\/nuxt-guide\.md/);
});
