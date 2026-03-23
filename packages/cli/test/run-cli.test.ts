import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../src/index.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const fixturesRoot = path.join(repoRoot, "tests/fixtures");

async function createTempFixtureCopy(fixtureName: string): Promise<string> {
  const sourceRoot = path.join(fixturesRoot, fixtureName);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `stackcn-cli-${fixtureName}-`));
  await cp(sourceRoot, tempRoot, { recursive: true });
  return tempRoot;
}

async function captureCliRun(args: readonly string[], cwd = repoRoot): Promise<{
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...values: unknown[]) => {
    stdout.push(values.map((value) => String(value)).join(" "));
  };
  console.error = (...values: unknown[]) => {
    stderr.push(values.map((value) => String(value)).join(" "));
  };

  try {
    const code = await runCli(args, cwd);
    return {
      code,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n")
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("doctor --json returns structured report", async () => {
  const result = await captureCliRun(["doctor", "--root", "tests/fixtures/nuxt-basic", "--json"]);
  const report = JSON.parse(result.stdout) as {
    readonly schemaVersion: number;
    readonly summary: {
      readonly status: string;
    };
    readonly context: {
      readonly qualityProviderState: string;
      readonly docsSyncState: string;
    };
    readonly findings: readonly {
      readonly code: string;
    }[];
  };

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.summary.status, "warning");
  assert.equal(report.context.qualityProviderState, "none");
  assert.equal(report.context.docsSyncState, "none");
  assert.ok(report.findings.some((finding) => finding.code === "framework_nuxt_typescript_missing"));
});

test("init --json returns structured plan output", async () => {
  const result = await captureCliRun(["init", "--root", "tests/fixtures/nuxt-basic", "--json"]);
  const output = JSON.parse(result.stdout) as {
    readonly schemaVersion: number;
    readonly command: string;
    readonly mode: string;
    readonly plan: {
      readonly framework: string;
      readonly quality: string;
      readonly manifest: {
        readonly pack?: {
          readonly name?: string;
        };
      };
    };
  };

  assert.equal(result.code, 0);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.command, "init");
  assert.equal(output.mode, "plan");
  assert.equal(output.plan.framework, "nuxt");
  assert.equal(output.plan.quality, "ultracite");
  assert.equal(output.plan.manifest.pack?.name, "Nuxt 4");
});

test("init --json --apply returns structured apply result", async () => {
  const tempRoot = await createTempFixtureCopy("nuxt-basic");

  try {
    const result = await captureCliRun(["init", "--root", tempRoot, "--json", "--apply"]);
    const output = JSON.parse(result.stdout) as {
      readonly schemaVersion: number;
      readonly mode: string;
      readonly apply?: {
        readonly writtenFiles: readonly string[];
      };
    };

    assert.equal(result.code, 0);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.mode, "apply");
    assert.ok(output.apply?.writtenFiles.includes("nuxt.config.ts"));
    assert.ok(output.apply?.writtenFiles.includes(".stackcn/manifest.json"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generate --json returns structured generate result", async () => {
  const tempRoot = await createTempFixtureCopy("nuxt-basic");

  try {
    const initResult = await captureCliRun(["init", "--root", tempRoot, "--apply", "--json"]);
    assert.equal(initResult.code, 0);

    const result = await captureCliRun(["generate", "--root", tempRoot, "--json"]);
    const output = JSON.parse(result.stdout) as {
      readonly schemaVersion: number;
      readonly command: string;
      readonly target: string;
      readonly result: {
        readonly writtenFiles: readonly string[];
        readonly skippedFiles: readonly string[];
      };
    };

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.command, "generate");
    assert.equal(output.target, "all");
    assert.ok(output.result.writtenFiles.includes("AGENTS.md"));
    assert.ok(output.result.writtenFiles.includes("CLAUDE.md"));
    assert.ok(output.result.writtenFiles.includes(".ai-rulez/config.yaml"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generate rejects --run-ai-rulez when ai-rulez target is not selected", async () => {
  const result = await captureCliRun(["generate", "--root", "tests/fixtures/nuxt-basic", "--target", "claude", "--run-ai-rulez"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /--run-ai-rulez requires --target ai-rulez or --target all/);
});

test("sync --json returns structured sync result", async () => {
  const tempRoot = await createTempFixtureCopy("nuxt-basic");
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () =>
      new Response("<html><body><h1>Nuxt</h1><p>Fetched content</p></body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8"
        }
      });

    const result = await captureCliRun(["sync", "--root", tempRoot, "--source", "nuxt-guide", "--json"]);
    const output = JSON.parse(result.stdout) as {
      readonly schemaVersion: number;
      readonly command: string;
      readonly result: {
        readonly indexPath: string;
        readonly syncedSources: readonly {
          readonly id: string;
          readonly normalizedPath: string;
        }[];
      };
    };
    const normalized = await readFile(
      path.join(tempRoot, ".stackcn", "sources", "normalized", "nuxt-guide.md"),
      "utf8"
    );

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.command, "sync");
    assert.equal(output.result.indexPath, ".stackcn/sources/index.json");
    assert.equal(output.result.syncedSources[0]?.id, "nuxt-guide");
    assert.match(normalized, /Fetched content/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("revert --json restores the latest backup", async () => {
  const tempRoot = await createTempFixtureCopy("nuxt-basic");

  try {
    const beforePackageJson = await readFile(path.join(tempRoot, "package.json"), "utf8");
    const initResult = await captureCliRun(["init", "--root", tempRoot, "--apply", "--json"]);
    assert.equal(initResult.code, 0);

    const result = await captureCliRun(["revert", "--root", tempRoot, "--json"]);
    const output = JSON.parse(result.stdout) as {
      readonly schemaVersion: number;
      readonly command: string;
      readonly result: {
        readonly backupDirectory: string;
        readonly restoredPaths: readonly string[];
        readonly removedPaths: readonly string[];
      };
    };
    const afterPackageJson = await readFile(path.join(tempRoot, "package.json"), "utf8");

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.command, "revert");
    assert.ok(output.result.restoredPaths.includes("package.json"));
    assert.ok(output.result.removedPaths.includes("AGENTS.md"));
    assert.equal(afterPackageJson, beforePackageJson);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("add --json requires an explicit target and returns add output", async () => {
  const missingTarget = await captureCliRun(["add", "--root", "tests/fixtures/nuxt-basic", "--json"]);

  assert.equal(missingTarget.code, 1);
  assert.match(missingTarget.stderr, /stackcn add expects at least one explicit target/);

  const result = await captureCliRun(["add", "--root", "tests/fixtures/nuxt-basic", "--quality", "biome", "--json"]);
  const output = JSON.parse(result.stdout) as {
    readonly schemaVersion: number;
    readonly command: string;
    readonly mode: string;
    readonly plan: {
      readonly framework: string;
      readonly quality: string;
    };
  };

  assert.equal(result.code, 0);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.command, "add");
  assert.equal(output.mode, "plan");
  assert.equal(output.plan.framework, "nuxt");
  assert.equal(output.plan.quality, "biome");
});
