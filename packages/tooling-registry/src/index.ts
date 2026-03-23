export interface ToolingBaseline {
  readonly packageName: string;
  readonly versionRange: string;
  readonly rationale: string;
  readonly upgradeNote?: string;
}

export const toolingBaselines = {
  typescript: {
    packageName: "typescript",
    versionRange: "^5.8.2",
    rationale: "Nuxt and other typed framework baselines rely on modern TS inference and stable project tooling behavior.",
    upgradeNote: "Review framework-specific type generation when moving to a new TypeScript major."
  },
  vueTsc: {
    packageName: "vue-tsc",
    versionRange: "^2.2.10",
    rationale: "Nuxt typecheck depends on Vue-aware type analysis rather than plain tsc.",
    upgradeNote: "Keep vue-tsc aligned with the current Vue and Nuxt toolchain."
  },
  nodeTypes: {
    packageName: "@types/node",
    versionRange: "^24.7.0",
    rationale: "Typed backend baselines need explicit Node runtime types for entrypoints, build scripts, and framework APIs."
  },
  tsx: {
    packageName: "tsx",
    versionRange: "^4.20.6",
    rationale: "Backend TypeScript entrypoints need a low-friction runtime for local dev and non-built execution."
  },
  expressTypes: {
    packageName: "@types/express",
    versionRange: "^5.0.3",
    rationale: "TypeScript Express projects need explicit request and response typings in addition to the runtime package."
  },
  nestCli: {
    packageName: "@nestjs/cli",
    versionRange: "^11.0.0",
    rationale: "Nest build and watch workflows rely on the official Nest CLI when StackCanon wires baseline scripts.",
    upgradeNote: "Validate Nest build output and workspace settings before moving to a new Nest CLI major."
  },
  vitePluginReact: {
    packageName: "@vitejs/plugin-react",
    versionRange: "^5.0.0",
    rationale: "React + Vite baselines need the official React transform and Fast Refresh integration."
  },
  vitePluginVue: {
    packageName: "@vitejs/plugin-vue",
    versionRange: "^6.0.0",
    rationale: "Vue + Vite baselines rely on the official SFC compiler and HMR integration."
  },
  viteTsconfigPaths: {
    packageName: "vite-tsconfig-paths",
    versionRange: "^5.1.4",
    rationale: "TanStack Start on Vite 7 and earlier needs explicit tsconfig alias wiring."
  },
  biomeV1: {
    packageName: "@biomejs/biome",
    versionRange: "^1.9.4",
    rationale: "Legacy Biome v1 projects need the matching schema and config shape."
  },
  biomeV2: {
    packageName: "@biomejs/biome",
    versionRange: "^2.0.5",
    rationale: "Biome v2 is the current default formatter and linter baseline for StackCanon-managed config."
  },
  oxlint: {
    packageName: "oxlint",
    versionRange: "^1.16.0",
    rationale: "Oxlint baseline stays on the validated major used by StackCanon config generation."
  },
  ultracite: {
    packageName: "ultracite",
    versionRange: "^6.0.0",
    rationale: "Ultracite is the default quality baseline because it owns formatter, linter, and editor workflow integration.",
    upgradeNote: "Treat new Ultracite majors as vendor-managed migrations and validate prompts before automating them."
  }
} as const;

export type ToolingBaselineKey = keyof typeof toolingBaselines;

export const toolingVersions = {
  typescript: toolingBaselines.typescript.versionRange,
  vueTsc: toolingBaselines.vueTsc.versionRange,
  nodeTypes: toolingBaselines.nodeTypes.versionRange,
  tsx: toolingBaselines.tsx.versionRange,
  expressTypes: toolingBaselines.expressTypes.versionRange,
  nestCli: toolingBaselines.nestCli.versionRange,
  vitePluginReact: toolingBaselines.vitePluginReact.versionRange,
  vitePluginVue: toolingBaselines.vitePluginVue.versionRange,
  viteTsconfigPaths: toolingBaselines.viteTsconfigPaths.versionRange,
  biomeV1: toolingBaselines.biomeV1.versionRange,
  biomeV2: toolingBaselines.biomeV2.versionRange,
  oxlint: toolingBaselines.oxlint.versionRange,
  ultracite: toolingBaselines.ultracite.versionRange
} as const;

export const biomeSchemaUrls = {
  v1: "https://biomejs.dev/schemas/1.9.4/schema.json",
  v2: "https://biomejs.dev/schemas/2.0.5/schema.json"
} as const;

export const ultraciteVendorInit = {
  command: "npx",
  args: ["ultracite", "init"]
} as const;

export const ultraciteVendorBackupPaths = [
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "biome.jsonc",
  "biome.json",
  ".oxlintrc.json",
  ".vscode/settings.json",
  ".cursor",
  ".windsurf",
  ".zed",
  ".husky",
  "lefthook.yml",
  ".pre-commit-config.yaml",
  "lint-staged.config.js",
  "lint-staged.config.mjs",
  "lint-staged.config.cjs",
  "lint-staged.config.ts",
  "lint-staged.config.json",
  ".github/copilot-instructions.md"
] as const;

export function detectInstalledMajor(version?: string): number | undefined {
  if (!version) {
    return undefined;
  }

  const match = version.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

export function createPackageSpec(packageName: string, versionRange: string): string {
  return `${packageName}@${versionRange}`;
}

export function getToolingBaseline(tool: ToolingBaselineKey): ToolingBaseline {
  return toolingBaselines[tool];
}
