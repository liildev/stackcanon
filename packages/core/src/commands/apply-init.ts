import { cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  renderAgentsDocument,
  renderAiConfig,
  renderClaudeDocument,
  renderCoreRulesMarkdown,
  renderFrameworkContextMarkdown,
  renderQualityContextMarkdown,
} from "@stackcanon/ai-engine";
import { renderFrameworkConfig } from "@stackcanon/framework-adapters";
import { hasDependency } from "@stackcanon/detectors";
import {
  getQualityVendorInitPlan,
  getQualityPackagePatch,
  renderQualityConfig,
  renderVsCodeSettings
} from "@stackcanon/quality-adapters";
import { getFrameworkPackagePatch } from "@stackcanon/framework-adapters";
import type { InstallDependenciesOptions, InstallDependenciesResult } from "../install-dependencies.js";
import { installDependencies } from "../install-dependencies.js";
import { applyPackageJsonPatches, readPackageJson, writePackageJson } from "../package-json.js";
import type { RunVendorInitResult, VendorInitPlan } from "../run-vendor-init.js";
import { runVendorInit } from "../run-vendor-init.js";
import type { InitManifestPreview, InitPlan, PlannedFile } from "./init.js";

export interface ApplyInitResult {
  readonly backupDirectory: string;
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly installCommand?: string;
  readonly vendorInitCommand?: string;
}

interface PersistedManifest extends InitManifestPreview {
  readonly managedBy: "stackcn";
  readonly appliedAt: string;
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
}

interface BackupMetadata {
  readonly schemaVersion: 1;
  readonly managedBy: "stackcn";
  readonly root: string;
  readonly createdAt: string;
  readonly backupDirectory: string;
  readonly backedUpPaths: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly createdPaths: readonly string[];
}

export interface ApplyInitOptions {
  readonly installDependencies?: boolean;
  readonly runVendorInit?: boolean;
  readonly dependencyInstaller?: (input: InstallDependenciesOptions) => Promise<InstallDependenciesResult>;
  readonly vendorInitRunner?: (input: { readonly root: string; readonly plan: VendorInitPlan }) => Promise<RunVendorInitResult>;
}

async function ensureParentDirectory(root: string, relativeFilePath: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relativeFilePath)), { recursive: true });
}

async function writeTextFile(root: string, relativeFilePath: string, contents: string): Promise<void> {
  await ensureParentDirectory(root, relativeFilePath);
  await writeFile(path.join(root, relativeFilePath), contents, "utf8");
}

async function readTextFileIfPresent(root: string, relativeFilePath: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(root, relativeFilePath), "utf8");
  } catch {
    return undefined;
  }
}

async function backupTargetIfPresent(root: string, backupRoot: string, relativeFilePath: string): Promise<boolean> {
  if (relativeFilePath.endsWith("/")) {
    return false;
  }

  const sourcePath = path.join(root, relativeFilePath);
  const targetPath = path.join(backupRoot, relativeFilePath);

  try {
    const sourceStats = await lstat(sourcePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, {
      recursive: sourceStats.isDirectory()
    });
    return true;
  } catch {
    return false;
  }
}

function createPersistedManifest(
  plan: InitPlan,
  writtenFiles: readonly string[],
  skippedFiles: readonly string[]
): PersistedManifest {
  return {
    ...plan.manifest,
    managedBy: "stackcn",
    appliedAt: new Date().toISOString(),
    writtenFiles,
    skippedFiles
  };
}

function createProjectName(root: string): string {
  return path.basename(root);
}

function createPlannedFileMap(plan: InitPlan): ReadonlyMap<string, PlannedFile> {
  return new Map(
    plan.files
      .filter((plannedFile) => !plannedFile.path.endsWith("/"))
      .map((plannedFile) => [plannedFile.path, plannedFile] as const)
  );
}

function getLockfileCandidates(packageManager: InitPlan["detection"]["packageManager"]): readonly string[] {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm-lock.yaml"];
    case "npm":
      return ["package-lock.json"];
    case "yarn":
      return ["yarn.lock"];
    case "bun":
      return ["bun.lock", "bun.lockb"];
    default:
      return [];
  }
}

async function trackWrittenIfPresent(root: string, relativeFilePath: string, writtenFiles: string[]): Promise<void> {
  try {
    await lstat(path.join(root, relativeFilePath));
    if (!writtenFiles.includes(relativeFilePath)) {
      writtenFiles.push(relativeFilePath);
    }
  } catch {
    return;
  }
}

async function writeManagedFile(
  root: string,
  backupRoot: string,
  backedUpPaths: Set<string>,
  plannedFiles: ReadonlyMap<string, PlannedFile>,
  relativeFilePath: string,
  contents: string,
  writtenFiles: string[],
  skippedFiles: string[]
): Promise<void> {
  const plannedFile = plannedFiles.get(relativeFilePath);

  if (!plannedFile) {
    throw new Error(`No planned file entry found for ${relativeFilePath}. apply must stay in sync with init planning.`);
  }

  if (plannedFile.mode === "review" || plannedFile.ownership === "user-managed") {
    skippedFiles.push(relativeFilePath);
    return;
  }

  if (await backupTargetIfPresent(root, backupRoot, relativeFilePath)) {
    backedUpPaths.add(relativeFilePath);
  }
  await writeTextFile(root, relativeFilePath, contents);
  writtenFiles.push(relativeFilePath);
}

function createBackupMetadata(input: {
  readonly root: string;
  readonly createdAt: string;
  readonly backupDirectory: string;
  readonly backedUpPaths: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly skippedFiles: readonly string[];
}): BackupMetadata {
  const backedUpPathSet = new Set(input.backedUpPaths);

  return {
    schemaVersion: 1,
    managedBy: "stackcn",
    root: input.root,
    createdAt: input.createdAt,
    backupDirectory: input.backupDirectory,
    backedUpPaths: [...input.backedUpPaths].sort(),
    writtenFiles: [...input.writtenFiles],
    skippedFiles: [...input.skippedFiles],
    createdPaths: input.writtenFiles.filter((relativePath) => !backedUpPathSet.has(relativePath))
  };
}

export async function applyInitPlan(plan: InitPlan, options: ApplyInitOptions = {}): Promise<ApplyInitResult> {
  const root = plan.detection.root;
  const createdAt = new Date().toISOString();
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const backupDirectory = `.stackcn/backups/${timestamp}`;
  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];
  const backedUpPaths = new Set<string>();
  const backupRoot = path.join(root, backupDirectory);
  const plannedFiles = createPlannedFileMap(plan);
  let installCommand: string | undefined;
  let vendorInitCommand: string | undefined;

  await mkdir(backupRoot, { recursive: true });

  for (const plannedFile of plan.files) {
    if (plannedFile.mode === "patch" || plannedFile.mode === "review") {
      if (await backupTargetIfPresent(root, backupRoot, plannedFile.path)) {
        backedUpPaths.add(plannedFile.path);
      }
    }
  }

  const projectName = createProjectName(root);
  const manifestPath = ".stackcn/manifest.json";
  const packageJsonPath = "package.json";
  const aiConfigPath = "ai/config.yaml";
  const coreRulesPath = "ai/rules/stackcanon-core.md";
  const frameworkContextPath = "ai/context/framework.md";
  const qualityContextPath = "ai/context/quality.md";
  const agentsPath = "AGENTS.md";
  const claudePath = "CLAUDE.md";
  const vscodeSettingsPath = plan.detection.configFiles.vscodeSettings ?? ".vscode/settings.json";
  const detectedFramework = plan.detection.frameworks.find((entry) => entry.name === plan.framework);
  const packageJson = await readPackageJson(root);
  const frameworkPackagePatchInput: {
    backendEntry?: string;
    framework: typeof plan.framework;
    hasExpressTypes: boolean;
    hasNestCli: boolean;
    hasNodeTypes: boolean;
    hasTsconfig: boolean;
    viteVersion?: string;
    hasViteTsconfigPaths: boolean;
    hasTypeScript: boolean;
    hasVueTsc: boolean;
  } = {
    ...(plan.detection.backendEntry ? { backendEntry: plan.detection.backendEntry } : {}),
    framework: plan.framework,
    hasExpressTypes: hasDependency(plan.detection, "@types/express"),
    hasNestCli: hasDependency(plan.detection, "@nestjs/cli"),
    hasNodeTypes: hasDependency(plan.detection, "@types/node"),
    hasTsconfig: Boolean(plan.detection.configFiles.tsconfig),
    hasViteTsconfigPaths: hasDependency(plan.detection, "vite-tsconfig-paths"),
    hasTypeScript: plan.detection.hasTypeScript,
    hasVueTsc: hasDependency(plan.detection, "vue-tsc")
  };
  if (plan.detection.dependencies.vite) {
    frameworkPackagePatchInput.viteVersion = plan.detection.dependencies.vite;
  }
  const packagePatches = [
    ...(() => {
      const patch = getFrameworkPackagePatch(frameworkPackagePatchInput);
      return patch ? [patch] : [];
    })(),
    ...(plan.quality === "skip"
      ? []
      : [
          getQualityPackagePatch({
            provider: plan.quality,
            ...(plan.quality === "ultracite" && plan.manifest.qualityBackend
              ? { ultraciteBackend: plan.manifest.qualityBackend }
              : {}),
            ...(plan.quality === "ultracite"
              ? plan.detection.qualityVersions.ultracite
                ? { installedVersion: plan.detection.qualityVersions.ultracite }
                : {}
              : plan.quality === "biome"
                ? plan.detection.qualityVersions.biome
                  ? { installedVersion: plan.detection.qualityVersions.biome }
                  : {}
                : plan.detection.qualityVersions.oxlint
                  ? { installedVersion: plan.detection.qualityVersions.oxlint }
                  : {})
          })
        ])
  ];
  const packageJsonMutation = applyPackageJsonPatches(packageJson, packagePatches);
  const effectiveHasViteTsconfigPaths =
    hasDependency(plan.detection, "vite-tsconfig-paths") ||
    packageJsonMutation.changes.devDependencies.some((entry) => entry.startsWith("vite-tsconfig-paths@"));

  if (packageJsonMutation.changes.devDependencies.length > 0 || packageJsonMutation.changes.scripts.length > 0) {
    if (await backupTargetIfPresent(root, backupRoot, packageJsonPath)) {
      backedUpPaths.add(packageJsonPath);
    }
    await writePackageJson(root, packageJsonMutation.content);
    writtenFiles.push(packageJsonPath);
  }

  if (plan.framework === "next") {
    const nextConfigPath = plan.detection.configFiles.next ?? "next.config.ts";
    const nextExistingContent = await readTextFileIfPresent(root, nextConfigPath);
    const nextConfig = renderFrameworkConfig({
      framework: plan.framework,
      ...(detectedFramework?.version ? { version: detectedFramework.version } : {}),
      ...(nextExistingContent ? { existingContent: nextExistingContent } : {}),
      hasTypeScript: plan.detection.hasTypeScript
    });

    if (!nextConfig) {
      throw new Error("Next.js framework adapter did not return a config patch.");
    }

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      nextConfigPath,
      nextConfig.content,
      writtenFiles,
      skippedFiles
    );
  }

  if (plan.framework === "nuxt") {
    const nuxtConfigPath = plan.detection.configFiles.nuxt ?? "nuxt.config.ts";
    const nuxtExistingContent = await readTextFileIfPresent(root, nuxtConfigPath);
    const nuxtConfig = renderFrameworkConfig({
      framework: plan.framework,
      ...(detectedFramework?.version ? { version: detectedFramework.version } : {}),
      ...(nuxtExistingContent ? { existingContent: nuxtExistingContent } : {}),
      hasTypeScript: plan.detection.hasTypeScript
    });

    if (!nuxtConfig) {
      throw new Error("Nuxt framework adapter did not return a config patch.");
    }

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      nuxtConfigPath,
      nuxtConfig.content,
      writtenFiles,
      skippedFiles
    );
  }

  if (plan.framework === "nest") {
    const nestCliPath = plan.detection.configFiles.nestCli ?? "nest-cli.json";
    const nestExistingContent = await readTextFileIfPresent(root, nestCliPath);
    const nestConfig = renderFrameworkConfig({
      framework: plan.framework,
      ...(detectedFramework?.version ? { version: detectedFramework.version } : {}),
      ...(nestExistingContent ? { existingContent: nestExistingContent } : {}),
      hasTypeScript: plan.detection.hasTypeScript
    });

    if (!nestConfig) {
      throw new Error("Nest framework adapter did not return a config patch.");
    }

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      nestCliPath,
      nestConfig.content,
      writtenFiles,
      skippedFiles
    );
  }

  if (plan.framework === "vite-react" || plan.framework === "vite-vue" || plan.framework === "tanstack-start") {
    const viteConfigPath = plan.detection.configFiles.vite ?? "vite.config.ts";
    const viteExistingContent = await readTextFileIfPresent(root, viteConfigPath);
    const viteConfig = renderFrameworkConfig({
      framework: plan.framework,
      ...(detectedFramework?.version ? { version: detectedFramework.version } : {}),
      ...(viteExistingContent ? { existingContent: viteExistingContent } : {}),
      hasTypeScript: plan.detection.hasTypeScript,
      hasViteTsconfigPaths: effectiveHasViteTsconfigPaths
    });

    if (!viteConfig) {
      throw new Error(`${plan.framework} framework adapter did not return a config patch.`);
    }

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      viteConfigPath,
      viteConfig.content,
      writtenFiles,
      skippedFiles
    );
  }

  if (plan.quality === "ultracite" || plan.quality === "biome") {
    const qualityConfigPath =
      plan.quality === "ultracite" && plan.manifest.qualityBackend === "oxlint"
        ? plan.detection.configFiles.oxlint ?? ".oxlintrc.json"
        : plan.detection.configFiles.biome ?? "biome.jsonc";
    const qualityExistingContent = await readTextFileIfPresent(root, qualityConfigPath);
    const qualityConfig = renderQualityConfig({
      provider: plan.quality,
      framework: plan.framework,
      ...(plan.quality === "ultracite"
        ? plan.detection.qualityVersions.ultracite
          ? { version: plan.detection.qualityVersions.ultracite }
          : {}
        : plan.detection.qualityVersions.biome
          ? { version: plan.detection.qualityVersions.biome }
        : {}),
      ...(plan.quality === "ultracite" && plan.manifest.qualityBackend
        ? { ultraciteBackend: plan.manifest.qualityBackend }
        : {}),
      ...(qualityExistingContent ? { existingContent: qualityExistingContent } : {})
    });

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      qualityConfigPath,
      qualityConfig.content,
      writtenFiles,
      skippedFiles
    );
  }

  if (plan.quality === "oxlint") {
    const oxlintExistingContent = await readTextFileIfPresent(root, plan.detection.configFiles.oxlint ?? ".oxlintrc.json");
    const qualityConfig = renderQualityConfig({
      provider: "oxlint",
      framework: plan.framework,
      ...(plan.detection.qualityVersions.oxlint ? { version: plan.detection.qualityVersions.oxlint } : {}),
      ...(oxlintExistingContent ? { existingContent: oxlintExistingContent } : {})
    });

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      plan.detection.configFiles.oxlint ?? qualityConfig.path,
      qualityConfig.content,
      writtenFiles,
      skippedFiles
    );
  }

  if (plan.quality !== "skip") {
    const existingVsCodeSettings = await readTextFileIfPresent(root, vscodeSettingsPath);
    const vscodeSettings = renderVsCodeSettings({
      provider: plan.quality,
      ...(existingVsCodeSettings ? { existingContent: existingVsCodeSettings } : {})
    });

    await writeManagedFile(
      root,
      backupRoot,
      backedUpPaths,
      plannedFiles,
      vscodeSettingsPath,
      vscodeSettings,
      writtenFiles,
      skippedFiles
    );
  }

  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    aiConfigPath,
    renderAiConfig({ projectName }),
    writtenFiles,
    skippedFiles
  );
  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    coreRulesPath,
    renderCoreRulesMarkdown(plan.framework, plan.quality, plan.manifest.pack?.compatibilityMode ?? false),
    writtenFiles,
    skippedFiles
  );
  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    frameworkContextPath,
    renderFrameworkContextMarkdown({
      framework: plan.framework,
      ...(plan.manifest.pack ? { pack: plan.manifest.pack } : {})
    }),
    writtenFiles,
    skippedFiles
  );
  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    qualityContextPath,
    renderQualityContextMarkdown(plan.quality),
    writtenFiles,
    skippedFiles
  );
  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    agentsPath,
    renderAgentsDocument({
      framework: plan.framework,
      quality: plan.quality,
      ...(plan.manifest.pack ? { pack: plan.manifest.pack } : {}),
      contextFiles: [coreRulesPath, frameworkContextPath, qualityContextPath]
    }),
    writtenFiles,
    skippedFiles
  );
  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    claudePath,
    renderClaudeDocument({
      framework: plan.framework,
      quality: plan.quality,
      ...(plan.manifest.pack ? { pack: plan.manifest.pack } : {}),
      contextFiles: [coreRulesPath, frameworkContextPath, qualityContextPath]
    }),
    writtenFiles,
    skippedFiles
  );

  if (options.runVendorInit) {
    const vendorInitPlan = plan.quality === "skip"
      ? undefined
      : getQualityVendorInitPlan({
          provider: plan.quality,
          ...(plan.quality === "ultracite" && plan.manifest.qualityBackend
            ? { ultraciteBackend: plan.manifest.qualityBackend }
            : {})
        });

    if (!vendorInitPlan) {
      throw new Error("Vendor init is only supported for the Ultracite quality provider right now.");
    }

    for (const backupPath of vendorInitPlan.backupPaths) {
      if (await backupTargetIfPresent(root, backupRoot, backupPath)) {
        backedUpPaths.add(backupPath);
      }
    }

    const vendorInitResult = await (options.vendorInitRunner ?? runVendorInit)({
      root,
      plan: vendorInitPlan
    });
    vendorInitCommand = vendorInitResult.command;

    for (const backupPath of vendorInitPlan.backupPaths) {
      await trackWrittenIfPresent(root, backupPath, writtenFiles);
    }
  }

  if (options.installDependencies) {
    const lockfileCandidates = getLockfileCandidates(plan.detection.packageManager);

    for (const lockfilePath of lockfileCandidates) {
      if (await backupTargetIfPresent(root, backupRoot, lockfilePath)) {
        backedUpPaths.add(lockfilePath);
      }
    }

    const installResult = await (options.dependencyInstaller ?? installDependencies)({
      root,
      packageManager: plan.detection.packageManager
    });
    installCommand = installResult.command;

    for (const lockfilePath of lockfileCandidates) {
      const lockfileContent = await readTextFileIfPresent(root, lockfilePath);
      if (lockfileContent && !writtenFiles.includes(lockfilePath)) {
        writtenFiles.push(lockfilePath);
      }
    }
  }

  await writeManagedFile(
    root,
    backupRoot,
    backedUpPaths,
    plannedFiles,
    manifestPath,
    `${JSON.stringify(
      createPersistedManifest(plan, [...writtenFiles, manifestPath], skippedFiles),
      null,
      2
    )}\n`,
    writtenFiles,
    skippedFiles
  );

  await writeTextFile(
    root,
    `${backupDirectory}/meta.json`,
    `${JSON.stringify(
      createBackupMetadata({
        root,
        createdAt,
        backupDirectory,
        backedUpPaths: [...backedUpPaths],
        writtenFiles,
        skippedFiles
      }),
      null,
      2
    )}\n`
  );

  return {
    backupDirectory,
    writtenFiles,
    skippedFiles,
    ...(installCommand ? { installCommand } : {}),
    ...(vendorInitCommand ? { vendorInitCommand } : {})
  };
}
