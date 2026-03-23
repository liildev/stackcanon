import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PackageJsonPatch as FrameworkPackageJsonPatch } from "@stackcanon/framework-adapters";
import type {
  PackageJsonPatch as QualityPackageJsonPatch,
  PackageScriptIntent
} from "@stackcanon/quality-adapters";

interface PackageJsonShape {
  name?: string;
  private?: boolean;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

export interface PackageJsonChangeSet {
  readonly devDependencies: readonly string[];
  readonly scripts: readonly string[];
}

export interface PackageJsonMutationResult {
  readonly content: string;
  readonly changes: PackageJsonChangeSet;
}

export type PackageJsonPatch = FrameworkPackageJsonPatch | QualityPackageJsonPatch;

function mergeDevDependencies(
  target: Record<string, string>,
  additions: Readonly<Record<string, string>> | undefined
): readonly string[] {
  if (!additions) {
    return [];
  }

  const changes: string[] = [];

  for (const [packageName, version] of Object.entries(additions)) {
    if (packageName in target) {
      continue;
    }

    target[packageName] = version;
    changes.push(`${packageName}@${version}`);
  }

  return changes;
}

function applyScriptIntent(
  scripts: Record<string, string>,
  intent: PackageScriptIntent
): string | undefined {
  const existingPreferred = scripts[intent.preferredName];
  if (!existingPreferred) {
    scripts[intent.preferredName] = intent.command;
    return `${intent.preferredName}=${intent.command}`;
  }

  if (existingPreferred === intent.command) {
    return undefined;
  }

  if (intent.fallbackName && !scripts[intent.fallbackName]) {
    scripts[intent.fallbackName] = intent.command;
    return `${intent.fallbackName}=${intent.command}`;
  }

  return undefined;
}

function mergeScripts(
  target: Record<string, string>,
  intents: readonly PackageScriptIntent[] | undefined
): readonly string[] {
  if (!intents?.length) {
    return [];
  }

  return intents.flatMap((intent) => {
    const change = applyScriptIntent(target, intent);
    return change ? [change] : [];
  });
}

export async function readPackageJson(root: string): Promise<PackageJsonShape> {
  const raw = await readFile(path.join(root, "package.json"), "utf8");
  return JSON.parse(raw) as PackageJsonShape;
}

export function applyPackageJsonPatches(
  packageJson: PackageJsonShape,
  patches: readonly PackageJsonPatch[]
): PackageJsonMutationResult {
  const nextPackageJson: PackageJsonShape = {
    ...packageJson,
    devDependencies: { ...(packageJson.devDependencies ?? {}) },
    scripts: { ...(packageJson.scripts ?? {}) }
  };

  const devDependencies = nextPackageJson.devDependencies ?? {};
  const scripts = nextPackageJson.scripts ?? {};

  const dependencyChanges: string[] = [];
  const scriptChanges: string[] = [];

  for (const patch of patches) {
    dependencyChanges.push(...mergeDevDependencies(devDependencies, patch.devDependencies));
    scriptChanges.push(...mergeScripts(scripts, patch.scripts));
  }

  nextPackageJson.devDependencies = devDependencies;
  nextPackageJson.scripts = scripts;

  return {
    content: `${JSON.stringify(nextPackageJson, null, 2)}\n`,
    changes: {
      devDependencies: dependencyChanges,
      scripts: scriptChanges
    }
  };
}

export async function writePackageJson(root: string, content: string): Promise<void> {
  await writeFile(path.join(root, "package.json"), content, "utf8");
}
