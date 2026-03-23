import type { FrameworkName } from "@stackcanon/detectors";
import {
  biomeSchemaUrls,
  createPackageSpec,
  detectInstalledMajor,
  toolingVersions,
  ultraciteVendorBackupPaths,
  ultraciteVendorInit
} from "@stackcanon/tooling-registry";

export type QualityProvider = "ultracite" | "biome" | "oxlint" | "skip";
export type UltraciteBackend = "biome" | "oxlint";

export interface QualityPolicy {
  readonly provider: QualityProvider;
  readonly installsIfMissing: boolean;
  readonly blocksIfConflictingProviderPresent: boolean;
  readonly reliesOnVendorInit: boolean;
}

export interface QualityProfile {
  readonly provider: Exclude<QualityProvider, "skip">;
  readonly displayName: string;
  readonly supportedMajors: readonly number[];
  readonly configFilePath?: string;
  readonly installSpec: string;
  readonly vendorInitCommand?: string;
}

export interface QualityConfigResult {
  readonly path: string;
  readonly content: string;
  readonly profile: QualityProfile;
}

export interface PackageScriptIntent {
  readonly preferredName: string;
  readonly fallbackName?: string;
  readonly command: string;
}

export interface PackageJsonPatch {
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: readonly PackageScriptIntent[];
  readonly notes?: readonly string[];
}

export interface QualityVendorInitPlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly note: string;
  readonly backupPaths: readonly string[];
}

export const qualityPolicies: readonly QualityPolicy[] = [
  {
    provider: "ultracite",
    installsIfMissing: true,
    blocksIfConflictingProviderPresent: true,
    reliesOnVendorInit: true
  },
  {
    provider: "biome",
    installsIfMissing: true,
    blocksIfConflictingProviderPresent: true,
    reliesOnVendorInit: false
  },
  {
    provider: "oxlint",
    installsIfMissing: true,
    blocksIfConflictingProviderPresent: true,
    reliesOnVendorInit: false
  },
  {
    provider: "skip",
    installsIfMissing: false,
    blocksIfConflictingProviderPresent: false,
    reliesOnVendorInit: false
  }
];

const biomeProfiles: readonly QualityProfile[] = [
  {
    provider: "biome",
    displayName: "Biome v1",
    supportedMajors: [1],
    configFilePath: "biome.json",
    installSpec: createPackageSpec("@biomejs/biome", toolingVersions.biomeV1)
  },
  {
    provider: "biome",
    displayName: "Biome v2",
    supportedMajors: [2],
    configFilePath: "biome.jsonc",
    installSpec: createPackageSpec("@biomejs/biome", toolingVersions.biomeV2)
  }
];

const oxlintProfiles: readonly QualityProfile[] = [
  {
    provider: "oxlint",
    displayName: "Oxlint v1",
    supportedMajors: [1],
    configFilePath: ".oxlintrc.json",
    installSpec: createPackageSpec("oxlint", toolingVersions.oxlint)
  }
];

const ultraciteProfiles: readonly QualityProfile[] = [
  {
    provider: "ultracite",
    displayName: "Ultracite v6",
    supportedMajors: [6],
    configFilePath: "biome.jsonc",
    installSpec: createPackageSpec("ultracite", toolingVersions.ultracite),
    vendorInitCommand: `${ultraciteVendorInit.command} ${ultraciteVendorInit.args.join(" ")}`
  }
];

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function resolveProfile(
  profiles: readonly QualityProfile[],
  fallbackIndex: number,
  version?: string
): QualityProfile {
  const detectedMajor = detectInstalledMajor(version);
  if (detectedMajor !== undefined) {
    const exact = profiles.find((profile) => profile.supportedMajors.includes(detectedMajor));
    if (exact) {
      return exact;
    }
  }

  const fallback = profiles[fallbackIndex];
  if (!fallback) {
    throw new Error("No quality profile fallback is configured.");
  }

  return fallback;
}

export function resolveQualityProfile(
  provider: Exclude<QualityProvider, "skip">,
  version?: string
): QualityProfile {
  switch (provider) {
    case "biome":
      return resolveProfile(biomeProfiles, biomeProfiles.length - 1, version);
    case "oxlint":
      return resolveProfile(oxlintProfiles, oxlintProfiles.length - 1, version);
    case "ultracite":
      return resolveProfile(ultraciteProfiles, ultraciteProfiles.length - 1, version);
  }
}

function specToRecord(spec: string): Record<string, string> {
  const separator = spec.lastIndexOf("@");
  if (separator <= 0) {
    throw new Error(`Invalid package spec: ${spec}`);
  }

  return {
    [spec.slice(0, separator)]: spec.slice(separator + 1)
  };
}

export function resolveUltraciteBackend(input: {
  readonly hasBiome: boolean;
  readonly hasOxlint: boolean;
}): UltraciteBackend {
  return input.hasOxlint && !input.hasBiome ? "oxlint" : "biome";
}

export function hasConflictingInstalledProviders(hasBiome: boolean, hasOxlint: boolean): boolean {
  return hasBiome && hasOxlint;
}

function stripJsonComments(input: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (inString) {
      result += current;
      if (isEscaped) {
        isEscaped = false;
      } else if (current === "\\") {
        isEscaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < input.length && input[index] !== "\n") {
        index += 1;
      }
      if (index < input.length) {
        result += "\n";
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function parseJsonLikeObject(input: string | undefined): Record<string, JsonValue> {
  if (!input) {
    return {};
  }

  const normalized = input.trim().startsWith("//")
    ? input.slice(input.indexOf("\n") + 1)
    : input;

  const parsed = JSON.parse(stripJsonComments(normalized)) as JsonValue;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
}

function isPlainObject(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeJsonValues(base: JsonValue | undefined, patch: JsonValue): JsonValue {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return [...new Set([...base, ...patch])];
  }

  if (isPlainObject(base) && isPlainObject(patch)) {
    const merged: Record<string, JsonValue> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      merged[key] = key in merged ? mergeJsonValues(merged[key], value) : value;
    }
    return merged;
  }

  return patch;
}

function stringifyJsonObject(value: Record<string, JsonValue>, lineComment?: string): string {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  return lineComment ? `${lineComment}\n${body}` : body;
}

function createIgnorePatterns(framework: FrameworkName): readonly string[] {
  const shared = ["node_modules/**", "coverage/**"];

  switch (framework) {
    case "next":
      return [...shared, ".next/**", "out/**"];
    case "nuxt":
      return [...shared, ".nuxt/**", ".output/**", "dist/**"];
    case "vite-react":
    case "vite-vue":
      return [...shared, "dist/**"];
    case "tanstack-start":
      return [...shared, ".output/**", ".vinxi/**", "dist/**"];
    default:
      return shared;
  }
}

function createBiomePatch(profile: QualityProfile, framework: FrameworkName): Record<string, JsonValue> {
  const ignore = [...createIgnorePatterns(framework)];

  if (profile.provider === "ultracite") {
    return {
      "//": "generated by stackcn",
      $schema: biomeSchemaUrls.v2,
      extends: [...createUltracitePresets(framework)],
      files: {
        ignoreUnknown: true,
        ignore
      }
    };
  }

  if (profile.supportedMajors.includes(1)) {
    return {
      $schema: biomeSchemaUrls.v1,
      formatter: {
        enabled: true,
        indentStyle: "space"
      },
      organizeImports: {
        enabled: true
      },
      linter: {
        enabled: true,
        rules: {
          recommended: true
        }
      },
      files: {
        ignore
      },
      javascript: {
        formatter: {
          quoteStyle: "double",
          semicolons: "always"
        }
      }
    };
  }

  return {
    "//": "generated by stackcn",
    $schema: biomeSchemaUrls.v2,
    formatter: {
      enabled: true,
      indentStyle: "space"
    },
    organizeImports: {
      enabled: true
    },
    linter: {
      enabled: true,
      rules: {
        recommended: true
      }
    },
      files: {
        ignoreUnknown: true,
        ignore
    },
    javascript: {
      formatter: {
        quoteStyle: "double",
        semicolons: "always"
      }
    }
  };
}

function createUltracitePresets(framework: FrameworkName): readonly string[] {
  switch (framework) {
    case "next":
      return ["ultracite/core", "ultracite/react", "ultracite/next"];
    case "nuxt":
      return ["ultracite/core", "ultracite/vue"];
    case "vite-react":
    case "tanstack-start":
    case "tanstack-query":
      return ["ultracite/core", "ultracite/react"];
    case "vite-vue":
      return ["ultracite/core", "ultracite/vue"];
    default:
      return ["ultracite/core"];
  }
}

function createOxlintPlugins(framework: FrameworkName): readonly string[] {
  switch (framework) {
    case "next":
      return ["typescript", "react", "nextjs", "jsx-a11y", "import"];
    case "nuxt":
      return ["typescript", "vue", "import"];
    case "vite-react":
    case "tanstack-start":
    case "tanstack-query":
      return ["typescript", "react", "jsx-a11y", "import"];
    case "vite-vue":
      return ["typescript", "vue", "import"];
    default:
      return ["typescript", "import"];
  }
}

function createOxlintPatch(framework: FrameworkName): Record<string, JsonValue> {
  return {
    "//": "generated by stackcn",
    plugins: [...createOxlintPlugins(framework)],
    categories: {
      correctness: "error",
      suspicious: "error",
      pedantic: "warn"
    },
    ignorePatterns: [...createIgnorePatterns(framework)],
    rules: {}
  };
}

export function renderQualityConfig(input: {
  readonly provider: Exclude<QualityProvider, "skip">;
  readonly framework: FrameworkName;
  readonly version?: string;
  readonly existingContent?: string;
  readonly ultraciteBackend?: UltraciteBackend;
}): QualityConfigResult {
  const backendProvider =
    input.provider === "ultracite"
      ? input.ultraciteBackend ?? "biome"
      : input.provider;
  const profile = resolveQualityProfile(input.provider, input.version);

  if (backendProvider === "oxlint") {
    const existing = parseJsonLikeObject(input.existingContent);
    const merged = mergeJsonValues(existing, createOxlintPatch(input.framework)) as Record<string, JsonValue>;
    return {
      path: ".oxlintrc.json",
      content: stringifyJsonObject(merged),
      profile
    };
  }

  const existing = parseJsonLikeObject(input.existingContent);
  const merged = mergeJsonValues(existing, createBiomePatch(profile, input.framework)) as Record<string, JsonValue>;

  return {
    path: profile.configFilePath ?? "biome.jsonc",
    content: stringifyJsonObject(merged),
    profile
  };
}

function createVsCodePatch(provider: QualityProvider): Record<string, JsonValue> {
  const codeActions =
    provider === "oxlint"
      ? { "source.fixAll.oxlint": "explicit" }
      : provider === "skip"
        ? {}
        : { "source.fixAll.biome": "explicit" };

  return {
    "editor.formatOnSave": provider !== "skip",
    ...(provider === "skip"
      ? {}
      : {
          "editor.codeActionsOnSave": codeActions
        })
  };
}

export function renderVsCodeSettings(input: {
  readonly provider: QualityProvider;
  readonly existingContent?: string;
}): string {
  const existing = parseJsonLikeObject(input.existingContent);
  const merged = mergeJsonValues(existing, createVsCodePatch(input.provider)) as Record<string, JsonValue>;
  return stringifyJsonObject(merged, "// generated by stackcn");
}

export function getQualityInstallAction(
  provider: Exclude<QualityProvider, "skip">,
  installedVersion?: string
): string {
  const profile = resolveQualityProfile(provider, installedVersion);
  return installedVersion
    ? `Reuse installed ${profile.displayName} (${installedVersion})`
    : `Add ${profile.installSpec} to package.json`;
}

export function getUltraciteInitAction(packageManager: string, backend: "biome" | "oxlint"): string {
  const packageManagerHint = packageManager === "unknown" ? "" : ` in the ${packageManager} project`;
  return `Run npx ultracite init${packageManagerHint} and choose ${backend} during the prompts, or use --vendor-init`;
}

export function getQualityVendorInitPlan(input: {
  readonly provider: Exclude<QualityProvider, "skip">;
  readonly ultraciteBackend?: UltraciteBackend;
}): QualityVendorInitPlan | undefined {
  if (input.provider !== "ultracite") {
    return undefined;
  }

  const backend = input.ultraciteBackend ?? "biome";

  return {
    command: ultraciteVendorInit.command,
    args: ultraciteVendorInit.args,
    note: `Choose ${backend} during the prompts. Only enable extra AI editor rules or git hooks if you want StackCanon to coexist with them.`,
    backupPaths: ultraciteVendorBackupPaths
  };
}

export function getQualityPackagePatch(input: {
  readonly provider: Exclude<QualityProvider, "skip">;
  readonly installedVersion?: string;
  readonly ultraciteBackend?: UltraciteBackend;
}): PackageJsonPatch {
  if (input.provider === "ultracite") {
    const backend = input.ultraciteBackend ?? "biome";
    const ultraciteProfile = resolveQualityProfile("ultracite", input.installedVersion);
    const backendProfile = resolveQualityProfile(backend, undefined);

    return {
      devDependencies: {
        ...specToRecord(ultraciteProfile.installSpec),
        ...specToRecord(backendProfile.installSpec)
      },
      scripts: [
        {
          preferredName: "lint",
          fallbackName: "lint:quality",
          command: "ultracite check"
        },
        {
          preferredName: "format",
          fallbackName: "format:quality",
          command: "ultracite fix"
        }
      ],
      notes: [`Ultracite backend: ${backend}`]
    };
  }

  if (input.provider === "biome") {
    const profile = resolveQualityProfile("biome", input.installedVersion);
    return {
      devDependencies: specToRecord(profile.installSpec),
      scripts: [
        {
          preferredName: "lint",
          fallbackName: "lint:quality",
          command: "biome check ."
        },
        {
          preferredName: "format",
          fallbackName: "format:quality",
          command: "biome format --write ."
        }
      ]
    };
  }

  const profile = resolveQualityProfile("oxlint", input.installedVersion);
  return {
    devDependencies: specToRecord(profile.installSpec),
    scripts: [
      {
        preferredName: "lint",
        fallbackName: "lint:quality",
        command: "oxlint ."
      }
    ]
  };
}
