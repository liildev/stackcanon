import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { isStackcnManagedContent } from "@stackcanon/ai-engine";

export type ProjectCategory = "frontend" | "backend" | "fullstack";

export type FrameworkName =
  | "next"
  | "nuxt"
  | "vite-react"
  | "vite-vue"
  | "nest"
  | "express"
  | "fastify"
  | "tanstack-start"
  | "tanstack-query";

export interface DetectedFramework {
  readonly name: FrameworkName;
  readonly version: string;
}

export type ExistingFileOwnership = "stackcn-managed" | "user-managed";

export interface DetectionResult {
  readonly root: string;
  readonly packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
  readonly dependencies: Readonly<Record<string, string>>;
  readonly hasTypeScript: boolean;
  readonly backendEntry?: string;
  readonly frameworks: readonly DetectedFramework[];
  readonly hasBiome: boolean;
  readonly hasOxlint: boolean;
  readonly hasUltracite: boolean;
  readonly qualityVersions: {
    readonly biome?: string;
    readonly oxlint?: string;
    readonly ultracite?: string;
  };
  readonly configFiles: {
    readonly biome?: string;
    readonly nestCli?: string;
    readonly next?: string;
    readonly nuxt?: string;
    readonly oxlint?: string;
    readonly tsconfig?: string;
    readonly vite?: string;
    readonly vscodeSettings?: string;
  };
  readonly existingFiles: Readonly<Record<string, ExistingFileOwnership>>;
}

interface PackageJsonShape {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findFirstExistingFile(root: string, candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    const absolutePath = path.join(root, candidate);
    if (await fileExists(absolutePath)) {
      return candidate;
    }
  }

  return undefined;
}

function collectDependencies(packageJson: PackageJsonShape): Record<string, string> {
  return {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };
}

async function detectExistingFileOwnership(
  root: string,
  relativeFilePath: string
): Promise<ExistingFileOwnership | undefined> {
  try {
    const contents = await readFile(path.join(root, relativeFilePath), "utf8");
    return isStackcnManagedContent(contents) ? "stackcn-managed" : "user-managed";
  } catch {
    return undefined;
  }
}

async function collectExistingFileOwnerships(
  root: string,
  relativeFilePaths: readonly string[]
): Promise<Readonly<Record<string, ExistingFileOwnership>>> {
  const ownershipEntries = await Promise.all(
    relativeFilePaths.map(async (relativeFilePath) => {
      const ownership = await detectExistingFileOwnership(root, relativeFilePath);
      return ownership ? ([relativeFilePath, ownership] as const) : undefined;
    })
  );

  return Object.fromEntries(ownershipEntries.filter((entry) => entry !== undefined));
}

function detectFrameworks(dependencies: Record<string, string>): readonly DetectedFramework[] {
  const detected: DetectedFramework[] = [];

  const register = (pkgName: string, framework: FrameworkName): void => {
    const version = dependencies[pkgName];
    if (version) {
      detected.push({ name: framework, version });
    }
  };

  register("next", "next");
  register("nuxt", "nuxt");
  if (dependencies.vite && dependencies.react) {
    detected.push({ name: "vite-react", version: dependencies.vite });
  }
  if (dependencies.vite && dependencies.vue) {
    detected.push({ name: "vite-vue", version: dependencies.vite });
  }
  register("@nestjs/core", "nest");
  register("express", "express");
  register("fastify", "fastify");
  register("@tanstack/start", "tanstack-start");
  register("@tanstack/react-query", "tanstack-query");

  return detected;
}

export async function detectProject(root: string): Promise<DetectionResult> {
  const packageJsonPath = path.join(root, "package.json");
  const rawPackageJson = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(rawPackageJson) as PackageJsonShape;
  const dependencies = collectDependencies(packageJson);

  const packageManager = (await fileExists(path.join(root, "pnpm-lock.yaml")))
    ? "pnpm"
    : (await fileExists(path.join(root, "package-lock.json")))
      ? "npm"
      : (await fileExists(path.join(root, "yarn.lock")))
        ? "yarn"
        : (await fileExists(path.join(root, "bun.lockb"))) || (await fileExists(path.join(root, "bun.lock")))
          ? "bun"
          : "unknown";

  const biomeConfig = await findFirstExistingFile(root, ["biome.jsonc", "biome.json"]);
  const nestCliConfig = await findFirstExistingFile(root, ["nest-cli.json"]);
  const nextConfig = await findFirstExistingFile(root, ["next.config.ts", "next.config.mjs", "next.config.js"]);
  const nuxtConfig = await findFirstExistingFile(root, ["nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.js"]);
  const oxlintConfig = await findFirstExistingFile(root, [".oxlintrc.json", "oxlint.config.ts"]);
  const tsconfig = await findFirstExistingFile(root, ["tsconfig.json"]);
  const viteConfig = await findFirstExistingFile(root, ["vite.config.ts", "vite.config.js", "vite.config.mjs"]);
  const vscodeSettings = await findFirstExistingFile(root, [".vscode/settings.json"]);
  const backendEntry = await findFirstExistingFile(root, [
    "src/main.ts",
    "src/index.ts",
    "src/server.ts",
    "main.ts",
    "index.ts",
    "server.ts",
    "src/main.js",
    "src/index.js",
    "src/server.js",
    "main.js",
    "index.js",
    "server.js"
  ]);

  const configFiles: DetectionResult["configFiles"] = {
    ...(biomeConfig ? { biome: biomeConfig } : {}),
    ...(nestCliConfig ? { nestCli: nestCliConfig } : {}),
    ...(nextConfig ? { next: nextConfig } : {}),
    ...(nuxtConfig ? { nuxt: nuxtConfig } : {}),
    ...(oxlintConfig ? { oxlint: oxlintConfig } : {}),
    ...(tsconfig ? { tsconfig } : {}),
    ...(viteConfig ? { vite: viteConfig } : {}),
    ...(vscodeSettings ? { vscodeSettings } : {})
  };

  const trackedFiles = [
    ...Object.values(configFiles),
    "ai/config.yaml",
    "ai/rules/stackcanon-core.md",
    "ai/context/framework.md",
    "ai/context/quality.md",
    ".ai-rulez/config.yaml",
    ".ai-rulez/rules/stackcanon-core.md",
    ".ai-rulez/context/framework.md",
    ".ai-rulez/context/quality.md",
    ".ai-rulez/agents/stackcanon.md",
    ".ai-rulez/commands/README.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".stackcn/manifest.json"
  ];

  const qualityVersions: DetectionResult["qualityVersions"] = {
    ...("@biomejs/biome" in dependencies ? { biome: dependencies["@biomejs/biome"] } : {}),
    ...("oxlint" in dependencies ? { oxlint: dependencies.oxlint } : {}),
    ...("ultracite" in dependencies ? { ultracite: dependencies.ultracite } : {})
  };

  return {
    root,
    packageManager,
    dependencies,
    hasTypeScript: "typescript" in dependencies || (await fileExists(path.join(root, "tsconfig.json"))),
    ...(backendEntry ? { backendEntry } : {}),
    frameworks: detectFrameworks(dependencies),
    hasBiome: "@biomejs/biome" in dependencies,
    hasOxlint: "oxlint" in dependencies,
    hasUltracite: "ultracite" in dependencies,
    qualityVersions,
    configFiles,
    existingFiles: await collectExistingFileOwnerships(root, trackedFiles)
  };
}

export function getExistingFileOwnership(
  detection: DetectionResult,
  relativeFilePath: string
): ExistingFileOwnership | undefined {
  return detection.existingFiles[relativeFilePath];
}

export function getDependencyVersion(
  detection: DetectionResult,
  packageName: string
): string | undefined {
  return detection.dependencies[packageName];
}

export function hasDependency(
  detection: DetectionResult,
  packageName: string
): boolean {
  return packageName in detection.dependencies;
}
