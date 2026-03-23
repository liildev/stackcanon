import type { AiEnginePlan, PackContextInput } from "@stackcanon/ai-engine";
import { createAiEnginePlan } from "@stackcanon/ai-engine";
import type {
  DetectionResult,
  FrameworkName
} from "@stackcanon/detectors";
import { detectProject, getDependencyVersion, getExistingFileOwnership, hasDependency } from "@stackcanon/detectors";
import { getFrameworkPolicy } from "@stackcanon/framework-adapters";
import { getFrameworkPackagePatch } from "@stackcanon/framework-adapters";
import { getLatestPackForFramework, resolvePack } from "@stackcanon/packs";
import { detectInstalledMajor } from "@stackcanon/tooling-registry";
import type { QualityProvider } from "@stackcanon/quality-adapters";
import {
  getQualityPackagePatch,
  getQualityInstallAction,
  getUltraciteInitAction,
  hasConflictingInstalledProviders,
  resolveUltraciteBackend,
  resolveQualityProfile
} from "@stackcanon/quality-adapters";
import { applyPackageJsonPatches, readPackageJson } from "../package-json.js";

export interface InitOptions {
  readonly allowCompat?: boolean;
  readonly root: string;
  readonly framework?: FrameworkName;
  readonly quality?: QualityProvider;
}

export interface InitPlan {
  readonly detection: DetectionResult;
  readonly framework: FrameworkName;
  readonly quality: QualityProvider;
  readonly actions: readonly string[];
  readonly backups: readonly string[];
  readonly files: readonly PlannedFile[];
  readonly packageJson: PackageJsonPreview;
  readonly manifest: InitManifestPreview;
  readonly aiEngine: AiEnginePlan;
}

export type FileOwnership = "generated" | "stackcn-managed" | "user-managed";

export type PlannedFileMode = "create" | "patch" | "review";

export interface PlannedFile {
  readonly path: string;
  readonly mode: PlannedFileMode;
  readonly ownership: FileOwnership;
  readonly reason: string;
}

export interface InitManifestPreview {
  readonly schemaVersion: 1;
  readonly framework: FrameworkName;
  readonly quality: QualityProvider;
  readonly qualityBackend?: "biome" | "oxlint";
  readonly pack?: PackContextInput;
  readonly detectedFrameworks: readonly DetectionResult["frameworks"][number][];
  readonly packageManager: DetectionResult["packageManager"];
  readonly qualityVersions: DetectionResult["qualityVersions"];
  readonly generatedFiles: readonly string[];
}

export interface PackageJsonPreview {
  readonly devDependencies: readonly string[];
  readonly scripts: readonly string[];
}

interface ManagedFileDescriptor {
  readonly existingPath: string | undefined;
  readonly targetPath: string;
  readonly createReason: string;
  readonly patchReason: string;
  readonly reviewReason: string;
}

const reservedStackcanonPaths = [
  "ai/config.yaml",
  "ai/rules/stackcanon-core.md",
  "ai/context/framework.md",
  "ai/context/quality.md",
  ".stackcn/manifest.json"
] as const;

const frameworkPriority: readonly FrameworkName[] = [
  "tanstack-start",
  "next",
  "nuxt",
  "nest",
  "vite-react",
  "vite-vue",
  "tanstack-query",
  "fastify",
  "express"
];

function pickFramework(detection: DetectionResult, explicitFramework?: FrameworkName): FrameworkName {
  if (explicitFramework) {
    return explicitFramework;
  }

  const detected = frameworkPriority
    .map((framework) => detection.frameworks.find((entry) => entry.name === framework))
    .find((entry) => entry !== undefined);

  if (!detected) {
    throw new Error("No supported framework detected. stackcn v0.1 expects an existing project.");
  }

  return detected.name;
}

function pickQualityProvider(detection: DetectionResult, explicitQuality?: QualityProvider): QualityProvider {
  if (explicitQuality) {
    return explicitQuality;
  }

  if (detection.hasUltracite) {
    return "ultracite";
  }

  if (detection.hasBiome) {
    return "biome";
  }

  if (detection.hasOxlint) {
    return "oxlint";
  }

  return "ultracite";
}

function describeOwnershipAction(
  detection: DetectionResult,
  existingPath: string | undefined,
  createMessage: string,
  patchMessage: (relativePath: string) => string,
  reviewMessage: (relativePath: string) => string
): string {
  if (!existingPath) {
    return createMessage;
  }

  const ownership = getExistingFileOwnership(detection, existingPath);
  if (ownership === "stackcn-managed") {
    return patchMessage(existingPath);
  }

  return reviewMessage(existingPath);
}

function createFrameworkActions(detection: DetectionResult, framework: FrameworkName): readonly string[] {
  switch (framework) {
    case "next":
      return [
        describeOwnershipAction(
          detection,
          detection.configFiles.next,
          "Prepare a generated Next config baseline",
          (relativePath) => `Patch stackcn-managed Next config: ${relativePath}`,
          (relativePath) => `Review user-managed Next config before patching: ${relativePath}`
        )
      ];
    case "nuxt":
      return [
        describeOwnershipAction(
          detection,
          detection.configFiles.nuxt,
          "Prepare a generated Nuxt config baseline",
          (relativePath) => `Patch stackcn-managed Nuxt config: ${relativePath}`,
          (relativePath) => `Review user-managed Nuxt config before patching: ${relativePath}`
        )
      ];
    case "vite-react":
    case "vite-vue":
      return [
        describeOwnershipAction(
          detection,
          detection.configFiles.vite,
          "Prepare a generated Vite config baseline",
          (relativePath) => `Patch stackcn-managed Vite config: ${relativePath}`,
          (relativePath) => `Review user-managed Vite config before patching: ${relativePath}`
        )
      ];
    case "tanstack-start":
      const viteMajor = detectInstalledMajor(getDependencyVersion(detection, "vite")) ?? 8;
      return [
        describeOwnershipAction(
          detection,
          detection.configFiles.vite,
          "Prepare TanStack Start Vite config guidance",
          (relativePath) => `Patch stackcn-managed TanStack Start Vite config: ${relativePath}`,
          (relativePath) => `Review user-managed TanStack Start Vite config before patching: ${relativePath}`
        ),
        ...((viteMajor < 8 && !hasDependency(detection, "vite-tsconfig-paths"))
          ? ["StackCanon will add vite-tsconfig-paths because Vite 7 and earlier need it for tsconfig path aliases."]
          : [])
      ];
    case "nest":
      return [
        describeOwnershipAction(
          detection,
          detection.configFiles.nestCli,
          "Prepare a generated Nest CLI baseline",
          (relativePath) => `Patch stackcn-managed Nest CLI config: ${relativePath}`,
          (relativePath) => `Review user-managed Nest CLI config before patching: ${relativePath}`
        )
      ];
    case "express":
    case "fastify":
      return detection.backendEntry
        ? [
            `Prepare backend runtime scripts around the detected entrypoint: ${detection.backendEntry}`,
            ...(detection.hasTypeScript && !detection.configFiles.tsconfig
              ? ["TypeScript backend entrypoint detected without tsconfig.json. StackCanon will skip build script generation until tsconfig.json exists."]
              : [])
          ]
        : ["No backend entrypoint was detected, so StackCanon will not generate runtime scripts yet."];
    default:
      return ["No framework-specific config file patch required yet"];
  }
}

function createQualityActions(
  detection: DetectionResult,
  quality: QualityProvider,
  framework: FrameworkName
): readonly string[] {
  if (quality === "skip") {
    return ["Skip quality provider setup"];
  }

  if (quality === "ultracite") {
    const providerSource = resolveUltraciteBackend({
      hasBiome: detection.hasBiome,
      hasOxlint: detection.hasOxlint
    });
    const frameworkPreset =
      framework === "next"
        ? "ultracite/core + ultracite/react + ultracite/next"
        : framework === "nuxt"
          ? "ultracite/core + ultracite/vue"
        : framework === "vite-react"
          ? "ultracite/core + ultracite/react"
          : framework === "vite-vue"
            ? "ultracite/core + ultracite/vue"
            : "ultracite/core";

    return [
      getQualityInstallAction("ultracite", detection.qualityVersions.ultracite),
      getUltraciteInitAction(detection.packageManager, providerSource),
      describeOwnershipAction(
        detection,
        providerSource === "oxlint" ? detection.configFiles.oxlint : detection.configFiles.biome,
        `Create ${providerSource === "oxlint" ? ".oxlintrc.json" : resolveQualityProfile("ultracite", detection.qualityVersions.ultracite).configFilePath ?? "biome.jsonc"} with presets: ${frameworkPreset}`,
        (relativePath) => `Patch stackcn-managed ${relativePath} with presets: ${frameworkPreset}`,
        (relativePath) => `Review user-managed ${relativePath} before Ultracite merge: ${frameworkPreset}`
      ),
      describeOwnershipAction(
        detection,
        detection.configFiles.vscodeSettings,
        "Create .vscode/settings.json for editor integration",
        (relativePath) => `Patch stackcn-managed editor settings: ${relativePath}`,
        (relativePath) => `Review user-managed editor settings before merge: ${relativePath}`
      )
    ];
  }

  if (quality === "biome") {
    const profile = resolveQualityProfile("biome", detection.qualityVersions.biome);
    return [
      getQualityInstallAction("biome", detection.qualityVersions.biome),
      describeOwnershipAction(
        detection,
        detection.configFiles.biome,
        `Create ${profile.configFilePath ?? "biome.jsonc"}`,
        (relativePath) => `Patch stackcn-managed Biome config: ${relativePath}`,
        (relativePath) => `Review user-managed Biome config before patching: ${relativePath}`
      )
    ];
  }

  const profile = resolveQualityProfile("oxlint", detection.qualityVersions.oxlint);
  return [
    getQualityInstallAction("oxlint", detection.qualityVersions.oxlint),
    describeOwnershipAction(
      detection,
      detection.configFiles.oxlint,
      `Create ${profile.configFilePath ?? ".oxlintrc.json"}`,
      (relativePath) => `Patch stackcn-managed Oxlint config: ${relativePath}`,
      (relativePath) => `Review user-managed Oxlint config before patching: ${relativePath}`
    )
  ];
}

function toPlannedFile(
  detection: DetectionResult,
  descriptor: ManagedFileDescriptor
): PlannedFile {
  const existingPath = descriptor.existingPath ?? descriptor.targetPath;
  const existingOwnership = getExistingFileOwnership(detection, existingPath);

  if (!existingOwnership) {
    return {
      path: descriptor.targetPath,
      mode: "create",
      ownership: "generated",
      reason: descriptor.createReason
    };
  }

  if (existingOwnership === "stackcn-managed") {
    return {
      path: existingPath,
      mode: "patch",
      ownership: "stackcn-managed",
      reason: descriptor.patchReason
    };
  }

  return {
    path: existingPath,
    mode: "review",
    ownership: "user-managed",
    reason: descriptor.reviewReason
  };
}

function createFrameworkFiles(detection: DetectionResult, framework: FrameworkName): readonly PlannedFile[] {
  switch (framework) {
    case "next":
      return [
        toPlannedFile(detection, {
          existingPath: detection.configFiles.next,
          targetPath: "next.config.ts",
          createReason: "No Next config was found, so stackcn can generate a baseline.",
          patchReason: "The existing Next config is stackcn-managed and can be patched safely.",
          reviewReason: "The existing Next config is user-managed and requires review before editing."
        })
      ];
    case "nuxt":
      return [
        toPlannedFile(detection, {
          existingPath: detection.configFiles.nuxt,
          targetPath: "nuxt.config.ts",
          createReason: "No Nuxt config was found, so stackcn can generate a baseline.",
          patchReason: "The existing Nuxt config is stackcn-managed and can be patched safely.",
          reviewReason: "The existing Nuxt config is user-managed and requires review before editing."
        })
      ];
    case "vite-react":
    case "vite-vue":
    case "tanstack-start":
      return [
        toPlannedFile(detection, {
          existingPath: detection.configFiles.vite,
          targetPath: "vite.config.ts",
          createReason: "No Vite config was found, so stackcn can generate a baseline.",
          patchReason: "The existing Vite config is stackcn-managed and can be patched safely.",
          reviewReason: "The existing Vite config is user-managed and requires review before editing."
        })
      ];
    case "nest":
      return [
        toPlannedFile(detection, {
          existingPath: detection.configFiles.nestCli,
          targetPath: "nest-cli.json",
          createReason: "No Nest CLI config was found, so stackcn can generate a baseline.",
          patchReason: "The existing Nest CLI config is stackcn-managed and can be patched safely.",
          reviewReason: "The existing Nest CLI config is user-managed and requires review before editing."
        })
      ];
    default:
      return [];
  }
}

function createQualityFiles(detection: DetectionResult, quality: QualityProvider): readonly PlannedFile[] {
  if (quality === "skip") {
    return [];
  }

  if (quality === "ultracite") {
    const profile = resolveQualityProfile("ultracite", detection.qualityVersions.ultracite);
    const backend = resolveUltraciteBackend({
      hasBiome: detection.hasBiome,
      hasOxlint: detection.hasOxlint
    });
    return [
      toPlannedFile(detection, {
        existingPath: backend === "oxlint" ? detection.configFiles.oxlint : detection.configFiles.biome,
        targetPath: backend === "oxlint" ? ".oxlintrc.json" : profile.configFilePath ?? "biome.jsonc",
        createReason: `Ultracite will generate a ${backend} provider config for this project.`,
        patchReason: "The existing quality config is stackcn-managed and can be updated for Ultracite.",
        reviewReason: "The existing quality config is user-managed and should not be overwritten by Ultracite."
      }),
      toPlannedFile(detection, {
        existingPath: detection.configFiles.vscodeSettings,
        targetPath: ".vscode/settings.json",
        createReason: "Editor integration settings need to be created.",
        patchReason: "The existing editor settings file is stackcn-managed and can be updated safely.",
        reviewReason: "The existing editor settings file is user-managed and should be merged manually."
      })
    ];
  }

  if (quality === "biome") {
    const profile = resolveQualityProfile("biome", detection.qualityVersions.biome);
    return [
      toPlannedFile(detection, {
        existingPath: detection.configFiles.biome,
        targetPath: profile.configFilePath ?? "biome.jsonc",
        createReason: "No Biome config was found.",
        patchReason: "The existing Biome config is stackcn-managed and can be patched safely.",
        reviewReason: "The existing Biome config is user-managed and requires review before editing."
      })
    ];
  }

  const profile = resolveQualityProfile("oxlint", detection.qualityVersions.oxlint);
  return [
    toPlannedFile(detection, {
      existingPath: detection.configFiles.oxlint,
      targetPath: profile.configFilePath ?? ".oxlintrc.json",
      createReason: "No Oxlint config was found.",
      patchReason: "The existing Oxlint config is stackcn-managed and can be patched safely.",
      reviewReason: "The existing Oxlint config is user-managed and requires review before editing."
    })
  ];
}

function createBaseGeneratedFiles(detection: DetectionResult): readonly PlannedFile[] {
  return [
    {
      path: ".stackcn/backups/<timestamp>/",
      mode: "create",
      ownership: "generated",
      reason: "Every apply flow should create a reversible backup snapshot."
    },
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: ".stackcn/manifest.json",
      createReason: "stackcn records the applied packs and generated artifacts here.",
      patchReason: "The existing manifest is stackcn-managed and can be updated safely.",
      reviewReason: "The existing manifest is user-managed and requires review before editing."
    }),
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: "ai/config.yaml",
      createReason: "AI source-of-truth starts from the canonical ai/ directory.",
      patchReason: "The canonical ai/config.yaml file is stackcn-managed and can be refreshed safely.",
      reviewReason: "The canonical ai/config.yaml file is user-managed and should not be overwritten."
    }),
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: "ai/rules/stackcanon-core.md",
      createReason: "Core AI rules should be created in the canonical ai/ directory.",
      patchReason: "The core AI rules file is stackcn-managed and can be refreshed safely.",
      reviewReason: "The core AI rules file is user-managed and should not be overwritten."
    }),
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: "ai/context/framework.md",
      createReason: "Framework context should be created in the canonical ai/ directory.",
      patchReason: "The framework context file is stackcn-managed and can be refreshed safely.",
      reviewReason: "The framework context file is user-managed and should not be overwritten."
    }),
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: "ai/context/quality.md",
      createReason: "Quality-provider context should be created in the canonical ai/ directory.",
      patchReason: "The quality context file is stackcn-managed and can be refreshed safely.",
      reviewReason: "The quality context file is user-managed and should not be overwritten."
    }),
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: "AGENTS.md",
      createReason: "Root-level AI entrypoint should be generated from the resolved stack context.",
      patchReason: "The existing AGENTS.md is stackcn-managed and can be regenerated safely.",
      reviewReason: "The existing AGENTS.md is user-managed and should not be overwritten."
    }),
    toPlannedFile(detection, {
      existingPath: undefined,
      targetPath: "CLAUDE.md",
      createReason: "Claude-specific output should be generated from the canonical ai/ context.",
      patchReason: "The existing CLAUDE.md is stackcn-managed and can be regenerated safely.",
      reviewReason: "The existing CLAUDE.md is user-managed and should not be overwritten."
    })
  ];
}

function createPackContext(
  name: string,
  versionRange: string,
  lastReviewed: string,
  sources: readonly string[],
  summary: string,
  guidance: readonly string[],
  focusAreas: readonly string[] | undefined,
  reviewChecklist: readonly string[] | undefined,
  compatibilityMode = false
): PackContextInput {
  return {
    name,
    versionRange,
    lastReviewed,
    sources,
    summary,
    guidance,
    ...(focusAreas?.length ? { focusAreas } : {}),
    ...(reviewChecklist?.length ? { reviewChecklist } : {}),
    ...(compatibilityMode ? { compatibilityMode } : {})
  };
}

function buildManifestPreview(
  detection: DetectionResult,
  framework: FrameworkName,
  quality: QualityProvider,
  files: readonly PlannedFile[],
  pack?: PackContextInput,
  qualityBackend?: "biome" | "oxlint"
): InitManifestPreview {
  return {
    schemaVersion: 1,
    framework,
    quality,
    ...(qualityBackend ? { qualityBackend } : {}),
    ...(pack ? { pack } : {}),
    detectedFrameworks: detection.frameworks,
    packageManager: detection.packageManager,
    qualityVersions: detection.qualityVersions,
    generatedFiles: files
      .filter((file) => file.mode !== "review" && !file.path.endsWith("/"))
      .map((file) => file.path)
  };
}

function ensureReservedPathsAreSafe(detection: DetectionResult): void {
  for (const relativePath of reservedStackcanonPaths) {
    const ownership = getExistingFileOwnership(detection, relativePath);
    if (ownership === "user-managed") {
      throw new Error(`Reserved StackCanon path is user-managed and blocks safe install: ${relativePath}.`);
    }
  }
}

function ensureFrameworkInstalled(detection: DetectionResult, framework: FrameworkName): void {
  const frameworkPolicy = getFrameworkPolicy(framework);
  if (!frameworkPolicy) {
    throw new Error(`No framework policy found for ${framework}.`);
  }

  if (!frameworkPolicy.requiresExistingDependency) {
    return;
  }

  const installed = detection.frameworks.some((entry) => entry.name === framework);
  if (!installed) {
    throw new Error(`${framework} is not installed in this project. stackcn v0.1 only supports existing projects.`);
  }
}

export async function createInitPlan(options: InitOptions): Promise<InitPlan> {
  const detection = await detectProject(options.root);
  ensureReservedPathsAreSafe(detection);
  const packageJson = await readPackageJson(options.root);

  if (hasConflictingInstalledProviders(detection.hasBiome, detection.hasOxlint)) {
    throw new Error("Conflict detected: both Biome and Oxlint are installed. stackcn requires a single quality provider.");
  }

  const framework = pickFramework(detection, options.framework);
  const quality = pickQualityProvider(detection, options.quality);
  const ultraciteBackend =
    quality === "ultracite"
      ? resolveUltraciteBackend({ hasBiome: detection.hasBiome, hasOxlint: detection.hasOxlint })
      : undefined;

  ensureFrameworkInstalled(detection, framework);

  const detectedFramework = detection.frameworks.find((entry) => entry.name === framework);
  const resolvedPack = detectedFramework
    ? resolvePack(framework, detectedFramework.version)
    : { status: "missing" as const };
  const compatibilityPack =
    resolvedPack.status === "unsupported-major" && options.allowCompat
      ? getLatestPackForFramework(framework)
      : undefined;

  if (resolvedPack.status === "unsupported-major" && !options.allowCompat) {
    throw new Error(`${framework} uses an unsupported major version. No validated pack is available yet.`);
  }

  const actions = [
    `Resolve ${framework} framework policy`,
    ...createFrameworkActions(detection, framework),
    `Resolve ${quality} quality provider`,
    ...createQualityActions(detection, quality, framework),
    "Create .stackcn backup and manifest",
    "Write ai/ source-of-truth files",
    "Write AGENTS.md and CLAUDE.md",
    "Prepare tool-specific AI outputs"
  ];

  const files = [
    ...createFrameworkFiles(detection, framework),
    ...createQualityFiles(detection, quality),
    ...createBaseGeneratedFiles(detection)
  ];
  const frameworkPackagePatchInput: {
    backendEntry?: string;
    framework: FrameworkName;
    hasExpressTypes: boolean;
    hasNestCli: boolean;
    hasNodeTypes: boolean;
    hasTsconfig: boolean;
    viteVersion?: string;
    hasViteTsconfigPaths: boolean;
    hasTypeScript: boolean;
    hasVueTsc: boolean;
  } = {
    ...(detection.backendEntry ? { backendEntry: detection.backendEntry } : {}),
    framework,
    hasExpressTypes: hasDependency(detection, "@types/express"),
    hasNestCli: hasDependency(detection, "@nestjs/cli"),
    hasNodeTypes: hasDependency(detection, "@types/node"),
    hasTsconfig: Boolean(detection.configFiles.tsconfig),
    hasViteTsconfigPaths: hasDependency(detection, "vite-tsconfig-paths"),
    hasTypeScript: detection.hasTypeScript,
    hasVueTsc: hasDependency(detection, "vue-tsc")
  };
  const detectedViteVersion = getDependencyVersion(detection, "vite");
  if (detectedViteVersion) {
    frameworkPackagePatchInput.viteVersion = detectedViteVersion;
  }
  const packagePatches = [
    ...(() => {
      const patch = getFrameworkPackagePatch(frameworkPackagePatchInput);
      return patch ? [patch] : [];
    })(),
    ...(quality === "skip"
      ? []
      : [
          getQualityPackagePatch({
            provider: quality,
            ...(quality === "ultracite" && ultraciteBackend ? { ultraciteBackend } : {}),
            ...(quality === "ultracite"
              ? detection.qualityVersions.ultracite
                ? { installedVersion: detection.qualityVersions.ultracite }
                : {}
              : quality === "biome"
                ? detection.qualityVersions.biome
                  ? { installedVersion: detection.qualityVersions.biome }
                  : {}
                : detection.qualityVersions.oxlint
                  ? { installedVersion: detection.qualityVersions.oxlint }
                  : {})
          })
        ])
  ];
  const packageJsonMutation = applyPackageJsonPatches(packageJson, packagePatches);
  const packageJsonPreview: PackageJsonPreview = packageJsonMutation.changes;
  if (packageJsonPreview.devDependencies.length > 0 || packageJsonPreview.scripts.length > 0) {
    actions.push("Patch package.json with required devDependencies and scripts");
  }

  let pack: PackContextInput | undefined;
  if (resolvedPack.status === "validated" && resolvedPack.pack) {
    pack = createPackContext(
      resolvedPack.pack.displayName,
      resolvedPack.pack.versionRange,
      resolvedPack.pack.lastReviewed,
      resolvedPack.pack.sources,
      resolvedPack.pack.summary,
      resolvedPack.pack.guidance,
      resolvedPack.pack.focusAreas,
      resolvedPack.pack.reviewChecklist
    );
    actions.splice(1, 0, `Load validated pack ${resolvedPack.pack.name} (${resolvedPack.pack.versionRange})`);
  } else if (compatibilityPack) {
    pack = createPackContext(
      compatibilityPack.displayName,
      compatibilityPack.versionRange,
      compatibilityPack.lastReviewed,
      compatibilityPack.sources,
      compatibilityPack.summary,
      compatibilityPack.guidance,
      compatibilityPack.focusAreas,
      compatibilityPack.reviewChecklist,
      true
    );
    actions.splice(
      1,
      0,
      `Use compatibility mode with ${compatibilityPack.name} (${compatibilityPack.versionRange}) because no validated pack exists for the detected major version`
    );
  } else if (resolvedPack.status === "missing") {
    actions.splice(1, 0, `No first-party pack found for ${framework} yet`);
  } else if (resolvedPack.status === "unsupported-major") {
    actions.splice(1, 0, "Use compatibility mode because no validated pack exists for the detected major version");
  }

  return {
    detection,
    framework,
    quality,
    actions,
    backups: [".stackcn/backups/<timestamp>/"],
    files,
    packageJson: packageJsonPreview,
    manifest: buildManifestPreview(detection, framework, quality, files, pack, ultraciteBackend),
    aiEngine: createAiEnginePlan("ai")
  };
}
