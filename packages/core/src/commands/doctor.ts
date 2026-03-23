import { readFile } from "node:fs/promises";
import type { DetectionResult } from "@stackcanon/detectors";
import { detectProject, getDependencyVersion, getExistingFileOwnership, hasDependency } from "@stackcanon/detectors";
import { getLatestPackForFramework, resolvePack } from "@stackcanon/packs";
import { hasConflictingInstalledProviders } from "@stackcanon/quality-adapters";
import { detectInstalledMajor, getToolingBaseline } from "@stackcanon/tooling-registry";
import { readSyncedSourceIndex } from "./sync.js";

export interface DoctorOptions {
  readonly root: string;
}

export type DoctorFindingCategory = "framework" | "quality" | "ownership" | "reserved" | "docs";
export type DoctorFindingCode =
  | "framework_missing_supported"
  | "framework_pack_validated"
  | "framework_pack_unsupported_major"
  | "framework_pack_missing"
  | "framework_next_config_missing"
  | "framework_nest_config_missing"
  | "framework_nest_cli_missing"
  | "framework_nuxt_config_missing"
  | "framework_nuxt_typescript_missing"
  | "framework_nuxt_vue_tsc_missing"
  | "framework_backend_entry_missing"
  | "framework_backend_tsconfig_missing"
  | "framework_backend_tsx_missing"
  | "framework_express_types_missing"
  | "framework_vite_react_plugin_missing"
  | "framework_vite_vue_plugin_missing"
  | "framework_tanstack_start_tsconfig_paths_missing"
  | "quality_provider_conflict"
  | "quality_provider_conflict_versions"
  | "quality_provider_detected"
  | "quality_provider_missing"
  | "docs_sync_missing"
  | "docs_sync_partial"
  | "docs_sync_stale"
  | "docs_sync_ready"
  | "ownership_stackcn_managed"
  | "ownership_user_managed"
  | "reserved_stackcn_managed"
  | "reserved_user_managed";

export interface DoctorFinding {
  readonly code: DoctorFindingCode;
  readonly category: DoctorFindingCategory;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface DoctorSummary {
  readonly status: "ok" | "warning" | "error";
  readonly totalFindings: number;
  readonly infoCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
}

export interface DoctorContext {
  readonly packageManager: DetectionResult["packageManager"];
  readonly qualityProviderState: "none" | "ultracite" | "biome" | "oxlint" | "conflict";
  readonly docsSyncState: "none" | "missing" | "partial" | "stale" | "ready";
}

export interface DoctorReport {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly summary: DoctorSummary;
  readonly context: DoctorContext;
  readonly detection: DetectionResult;
  readonly findings: readonly DoctorFinding[];
}

function formatToolingBaseline(tool: Parameters<typeof getToolingBaseline>[0]): string {
  const baseline = getToolingBaseline(tool);
  return `${baseline.packageName}@${baseline.versionRange}`;
}

function getToolingRationale(tool: Parameters<typeof getToolingBaseline>[0]): string {
  return getToolingBaseline(tool).rationale;
}

function createFinding(input: DoctorFinding): DoctorFinding {
  return input;
}

function resolveQualityProviderState(detection: DetectionResult): DoctorContext["qualityProviderState"] {
  if (hasConflictingInstalledProviders(detection.hasBiome, detection.hasOxlint)) {
    return "conflict";
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

  return "none";
}

interface PersistedManifest {
  readonly pack?: {
    readonly name?: string;
    readonly sources?: readonly string[];
  };
}

interface DocsSyncAssessment {
  readonly state: DoctorContext["docsSyncState"];
  readonly findings: readonly DoctorFinding[];
}

async function readManifest(root: string): Promise<PersistedManifest | undefined> {
  try {
    const rawManifest = await readFile(`${root}/.stackcn/manifest.json`, "utf8");
    return JSON.parse(rawManifest) as PersistedManifest;
  } catch {
    return undefined;
  }
}

function createSummary(findings: readonly DoctorFinding[]): DoctorSummary {
  const infoCount = findings.filter((finding) => finding.severity === "info").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const errorCount = findings.filter((finding) => finding.severity === "error").length;

  return {
    status: errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ok",
    totalFindings: findings.length,
    infoCount,
    warningCount,
    errorCount
  };
}

function toDateValue(input: string): number {
  const value = Date.parse(input);
  return Number.isNaN(value) ? 0 : value;
}

async function assessDocsSync(root: string): Promise<DocsSyncAssessment> {
  const manifest = await readManifest(root);
  const expectedSources = manifest?.pack?.sources ?? [];

  if (expectedSources.length === 0) {
    return {
      state: "none",
      findings: []
    };
  }

  const syncedIndex = await readSyncedSourceIndex(root);
  if (!syncedIndex || syncedIndex.sources.length === 0) {
    return {
      state: "missing",
      findings: [
        createFinding({
          code: "docs_sync_missing",
          category: "docs",
          severity: "warning",
          message: `Pack ${manifest?.pack?.name ?? "current"} has official sources configured, but no synced source index exists yet. Run stackcn sync.`,
          metadata: {
            expectedSourceCount: expectedSources.length
          }
        })
      ]
    };
  }

  const syncedByUrl = new Map(syncedIndex.sources.map((source) => [source.url, source] as const));
  const missingSources = expectedSources.filter((url) => !syncedByUrl.has(url));
  if (missingSources.length > 0) {
    return {
      state: "partial",
      findings: [
        createFinding({
          code: "docs_sync_partial",
          category: "docs",
          severity: "warning",
          message: `Only ${expectedSources.length - missingSources.length} of ${expectedSources.length} pack sources are synced. Run stackcn sync to fill the missing official docs.`,
          metadata: {
            expectedSourceCount: expectedSources.length,
            missingSourceCount: missingSources.length
          }
        })
      ]
    };
  }

  const staleSources = expectedSources.flatMap((url) => {
    const source = syncedByUrl.get(url);
    if (!source) {
      return [];
    }

    return toDateValue(source.fetchedAt) < toDateValue(source.lastVerified) ? [source] : [];
  });

  if (staleSources.length > 0) {
    return {
      state: "stale",
      findings: [
        createFinding({
          code: "docs_sync_stale",
          category: "docs",
          severity: "warning",
          message: `${staleSources.length} synced source entries are older than the registry verification date. Run stackcn sync to refresh local docs.`,
          metadata: {
            staleSourceCount: staleSources.length,
            expectedSourceCount: expectedSources.length
          }
        })
      ]
    };
  }

  return {
    state: "ready",
    findings: [
      createFinding({
        code: "docs_sync_ready",
        category: "docs",
        severity: "info",
        message: `All ${expectedSources.length} official pack sources are synced locally.`,
        metadata: {
          expectedSourceCount: expectedSources.length
        }
      })
    ]
  };
}

function createFrameworkFindings(detection: DetectionResult): readonly DoctorFinding[] {
  return detection.frameworks.flatMap<DoctorFinding>((framework) => {
    const resolvedPack = resolvePack(framework.name, framework.version);

    if (resolvedPack.status === "validated" && resolvedPack.pack) {
      return [
        createFinding({
          code: "framework_pack_validated",
          category: "framework",
          severity: "info",
          message: `${framework.name}@${framework.version} is covered by pack ${resolvedPack.pack.name} (${resolvedPack.pack.versionRange}).`,
          metadata: {
            framework: framework.name,
            version: framework.version,
            pack: resolvedPack.pack.name
          }
        })
      ];
    }

    if (resolvedPack.status === "unsupported-major") {
      const compatPack = getLatestPackForFramework(framework.name);
      return [
        createFinding({
          code: "framework_pack_unsupported_major",
          category: "framework",
          severity: "warning",
          message: compatPack
            ? `${framework.name}@${framework.version} has no validated pack for its detected major version. Compatibility mode would fall back to ${compatPack.name} (${compatPack.versionRange}).`
            : `${framework.name}@${framework.version} has no validated pack for its detected major version.`,
          metadata: {
            framework: framework.name,
            version: framework.version,
            compatibilityPack: compatPack?.name ?? "none"
          }
        })
      ];
    }

    return [
      createFinding({
        code: "framework_pack_missing",
        category: "framework",
        severity: "warning",
        message: `${framework.name}@${framework.version} has no first-party pack yet.`,
        metadata: {
          framework: framework.name,
          version: framework.version
        }
      })
    ];
  });
}

function createFrameworkReadinessFindings(detection: DetectionResult): readonly DoctorFinding[] {
  return detection.frameworks.flatMap<DoctorFinding>((framework) => {
    switch (framework.name) {
      case "next":
        return detection.configFiles.next
          ? []
          : [
              createFinding({
                code: "framework_next_config_missing",
                category: "framework",
                severity: "info",
                message: "Next.js config is missing. stackcn can create a safe next.config.ts baseline."
              })
            ];
      case "nest": {
        const findings: DoctorFinding[] = [];

        if (!detection.configFiles.nestCli) {
          findings.push(createFinding({
            code: "framework_nest_config_missing",
            category: "framework",
            severity: "info",
            message: "Nest CLI config is missing. stackcn can create a safe nest-cli.json baseline."
          }));
        }

        if (!hasDependency(detection, "@nestjs/cli")) {
          findings.push(createFinding({
            code: "framework_nest_cli_missing",
            category: "framework",
            severity: "warning",
            message: `Nest project is missing @nestjs/cli. StackCanon will add ${formatToolingBaseline("nestCli")}. Reason: ${getToolingRationale("nestCli")}`,
            metadata: {
              packageName: getToolingBaseline("nestCli").packageName,
              versionRange: getToolingBaseline("nestCli").versionRange
            }
          }));
        }

        return findings;
      }
      case "nuxt": {
        const findings: DoctorFinding[] = [];

        if (!detection.configFiles.nuxt) {
          findings.push(createFinding({
            code: "framework_nuxt_config_missing",
            category: "framework",
            severity: "info",
            message: "Nuxt config is missing. stackcn can create a safe nuxt.config.ts baseline."
          }));
        }

        if (!detection.hasTypeScript) {
          findings.push(createFinding({
            code: "framework_nuxt_typescript_missing",
            category: "framework",
            severity: "warning",
            message: `Nuxt project is missing TypeScript tooling. StackCanon will add ${formatToolingBaseline("typescript")}. Reason: ${getToolingRationale("typescript")}`,
            metadata: {
              packageName: getToolingBaseline("typescript").packageName,
              versionRange: getToolingBaseline("typescript").versionRange
            }
          }));
        }

        if (!hasDependency(detection, "vue-tsc")) {
          findings.push(createFinding({
            code: "framework_nuxt_vue_tsc_missing",
            category: "framework",
            severity: "warning",
            message: `Nuxt project is missing vue-tsc. StackCanon will add ${formatToolingBaseline("vueTsc")} and wire nuxt typecheck. Reason: ${getToolingRationale("vueTsc")}`,
            metadata: {
              packageName: getToolingBaseline("vueTsc").packageName,
              versionRange: getToolingBaseline("vueTsc").versionRange
            }
          }));
        }

        return findings;
      }
      case "express":
      case "fastify": {
        const findings: DoctorFinding[] = [];
        const isTypeScriptRuntime = Boolean(detection.backendEntry?.match(/\.(?:cts|mts|ts|tsx)$/));

        if (!detection.backendEntry) {
          findings.push(createFinding({
            code: "framework_backend_entry_missing",
            category: "framework",
            severity: "warning",
            message: `${framework.name} project has no detected entrypoint. StackCanon will skip runtime script generation until one of src/main, src/index, or src/server is present.`
          }));
          return findings;
        }

        if (isTypeScriptRuntime && !hasDependency(detection, "tsx")) {
          findings.push(createFinding({
            code: "framework_backend_tsx_missing",
            category: "framework",
            severity: "warning",
            message: `${framework.name} TypeScript entrypoint is missing tsx. StackCanon will add ${formatToolingBaseline("tsx")}. Reason: ${getToolingRationale("tsx")}`,
            metadata: {
              packageName: getToolingBaseline("tsx").packageName,
              versionRange: getToolingBaseline("tsx").versionRange
            }
          }));
        }

        if (isTypeScriptRuntime && !detection.configFiles.tsconfig) {
          findings.push(createFinding({
            code: "framework_backend_tsconfig_missing",
            category: "framework",
            severity: "warning",
            message: `${framework.name} TypeScript entrypoint has no tsconfig.json. StackCanon will avoid build script generation until tsconfig.json exists.`
          }));
        }

        if (framework.name === "express" && isTypeScriptRuntime && !hasDependency(detection, "@types/express")) {
          findings.push(createFinding({
            code: "framework_express_types_missing",
            category: "framework",
            severity: "warning",
            message: `Express TypeScript project is missing @types/express. StackCanon will add ${formatToolingBaseline("expressTypes")}. Reason: ${getToolingRationale("expressTypes")}`,
            metadata: {
              packageName: getToolingBaseline("expressTypes").packageName,
              versionRange: getToolingBaseline("expressTypes").versionRange
            }
          }));
        }

        return findings;
      }
      case "vite-react":
        return hasDependency(detection, "@vitejs/plugin-react")
          ? []
          : [
              createFinding({
                code: "framework_vite_react_plugin_missing",
                category: "framework",
                severity: "warning",
                message: `React + Vite project is missing @vitejs/plugin-react. StackCanon can add ${formatToolingBaseline("vitePluginReact")} and patch vite.config.ts. Reason: ${getToolingRationale("vitePluginReact")}`,
                metadata: {
                  packageName: getToolingBaseline("vitePluginReact").packageName,
                  versionRange: getToolingBaseline("vitePluginReact").versionRange
                }
              })
            ];
      case "vite-vue":
        return hasDependency(detection, "@vitejs/plugin-vue")
          ? []
          : [
              createFinding({
                code: "framework_vite_vue_plugin_missing",
                category: "framework",
                severity: "warning",
                message: `Vue + Vite project is missing @vitejs/plugin-vue. StackCanon can add ${formatToolingBaseline("vitePluginVue")} and patch vite.config.ts. Reason: ${getToolingRationale("vitePluginVue")}`,
                metadata: {
                  packageName: getToolingBaseline("vitePluginVue").packageName,
                  versionRange: getToolingBaseline("vitePluginVue").versionRange
                }
              })
            ];
      case "tanstack-start": {
        const viteMajor = detectInstalledMajor(getDependencyVersion(detection, "vite")) ?? 8;
        if (viteMajor < 8 && !hasDependency(detection, "vite-tsconfig-paths")) {
          return [
            createFinding({
              code: "framework_tanstack_start_tsconfig_paths_missing",
              category: "framework",
              severity: "warning",
              message: `TanStack Start on Vite 7 and earlier needs vite-tsconfig-paths for tsconfig aliases. StackCanon can add ${formatToolingBaseline("viteTsconfigPaths")}. Reason: ${getToolingRationale("viteTsconfigPaths")}`,
              metadata: {
                packageName: getToolingBaseline("viteTsconfigPaths").packageName,
                versionRange: getToolingBaseline("viteTsconfigPaths").versionRange,
                viteMajor
              }
            })
          ];
        }

        return [];
      }
      default:
        return [];
    }
  });
}

function createConfigOwnershipFindings(detection: DetectionResult): readonly DoctorFinding[] {
  const entries: Array<[label: string, relativePath: string | undefined]> = [
    ["Next config", detection.configFiles.next],
    ["Nest CLI config", detection.configFiles.nestCli],
    ["Nuxt config", detection.configFiles.nuxt],
    ["Vite config", detection.configFiles.vite],
    ["Biome config", detection.configFiles.biome],
    ["Oxlint config", detection.configFiles.oxlint],
    ["VS Code settings", detection.configFiles.vscodeSettings],
    ["AGENTS.md", "AGENTS.md"],
    ["CLAUDE.md", "CLAUDE.md"]
  ];

  return entries.flatMap<DoctorFinding>(([label, relativePath]) => {
    if (!relativePath) {
      return [];
    }

    const ownership = getExistingFileOwnership(detection, relativePath);
    if (!ownership) {
      return [];
    }

    return [
      createFinding({
        code: ownership === "stackcn-managed" ? "ownership_stackcn_managed" : "ownership_user_managed",
        category: "ownership",
        severity: ownership === "stackcn-managed" ? "info" : "warning",
        message:
          ownership === "stackcn-managed"
            ? `${label} is stackcn-managed and can be patched safely (${relativePath}).`
            : `${label} is user-managed and will require manual review (${relativePath}).`,
        metadata: {
          label,
          path: relativePath
        }
      })
    ];
  });
}

function createReservedPathFindings(detection: DetectionResult): readonly DoctorFinding[] {
  const reservedPaths = [
    "ai/config.yaml",
    "ai/rules/stackcanon-core.md",
    "ai/context/framework.md",
    "ai/context/quality.md",
    ".stackcn/manifest.json"
  ];

  return reservedPaths.flatMap<DoctorFinding>((relativePath) => {
    const ownership = getExistingFileOwnership(detection, relativePath);
    if (!ownership) {
      return [];
    }

    return [
      createFinding({
        code: ownership === "stackcn-managed" ? "reserved_stackcn_managed" : "reserved_user_managed",
        category: "reserved",
        severity: ownership === "stackcn-managed" ? "info" : "error",
        message:
          ownership === "stackcn-managed"
            ? `Reserved StackCanon path is already managed: ${relativePath}.`
            : `Reserved StackCanon path is user-managed and blocks safe install: ${relativePath}.`,
        metadata: {
          path: relativePath
        }
      })
    ];
  });
}

export async function createDoctorReport(options: DoctorOptions): Promise<DoctorReport> {
  const detection = await detectProject(options.root);
  const docsSyncAssessment = await assessDocsSync(options.root);
  const findings: DoctorFinding[] = [];

  if (detection.frameworks.length === 0) {
    findings.push(createFinding({
      code: "framework_missing_supported",
      category: "framework",
      severity: "error",
      message: "No supported framework detected. stackcn currently expects an existing supported project."
    }));
  }

  if (hasConflictingInstalledProviders(detection.hasBiome, detection.hasOxlint)) {
    findings.push(createFinding({
      code: "quality_provider_conflict",
      category: "quality",
      severity: "error",
      message: "Biome and Oxlint are both installed. stackcn requires a single quality provider."
    }));
    findings.push(createFinding({
      code: "quality_provider_conflict_versions",
      category: "quality",
      severity: "info",
      message: `Detected Biome ${detection.qualityVersions.biome} and Oxlint ${detection.qualityVersions.oxlint}.`,
      metadata: {
        biomeVersion: detection.qualityVersions.biome ?? "unknown",
        oxlintVersion: detection.qualityVersions.oxlint ?? "unknown"
      }
    }));
  }

  findings.push(...createFrameworkFindings(detection));
  findings.push(...createFrameworkReadinessFindings(detection));
  findings.push(...docsSyncAssessment.findings);
  findings.push(...createConfigOwnershipFindings(detection));
  findings.push(...createReservedPathFindings(detection));

  if (detection.hasUltracite) {
    const baseline = getToolingBaseline("ultracite");
    findings.push(createFinding({
      code: "quality_provider_detected",
      category: "quality",
      severity: "info",
      message: `Ultracite is installed (${detection.qualityVersions.ultracite}). StackCanon baseline: ${baseline.packageName}@${baseline.versionRange}.`,
      metadata: {
        provider: "ultracite",
        installedVersion: detection.qualityVersions.ultracite ?? "unknown",
        baselineVersionRange: baseline.versionRange
      }
    }));
  } else if (detection.hasBiome) {
    const baseline = getToolingBaseline("biomeV2");
    findings.push(createFinding({
      code: "quality_provider_detected",
      category: "quality",
      severity: "info",
      message: `Biome is installed (${detection.qualityVersions.biome}). StackCanon default Biome baseline: ${baseline.packageName}@${baseline.versionRange}.`,
      metadata: {
        provider: "biome",
        installedVersion: detection.qualityVersions.biome ?? "unknown",
        baselineVersionRange: baseline.versionRange
      }
    }));
  } else if (detection.hasOxlint) {
    const baseline = getToolingBaseline("oxlint");
    findings.push(createFinding({
      code: "quality_provider_detected",
      category: "quality",
      severity: "info",
      message: `Oxlint is installed (${detection.qualityVersions.oxlint}). StackCanon baseline: ${baseline.packageName}@${baseline.versionRange}.`,
      metadata: {
        provider: "oxlint",
        installedVersion: detection.qualityVersions.oxlint ?? "unknown",
        baselineVersionRange: baseline.versionRange
      }
    }));
  } else {
    const baseline = getToolingBaseline("ultracite");
    findings.push(createFinding({
      code: "quality_provider_missing",
      category: "quality",
      severity: "info",
      message: `No quality provider is installed. StackCanon defaults to ${baseline.packageName}@${baseline.versionRange}. Reason: ${baseline.rationale}`,
      metadata: {
        recommendedProvider: "ultracite",
        baselineVersionRange: baseline.versionRange
      }
    }));
  }

  return {
    schemaVersion: 1,
    root: detection.root,
    summary: createSummary(findings),
    context: {
      packageManager: detection.packageManager,
      qualityProviderState: resolveQualityProviderState(detection),
      docsSyncState: docsSyncAssessment.state
    },
    detection,
    findings
  };
}
