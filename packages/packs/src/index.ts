import type { FrameworkName } from "@stackcanon/detectors";
import type { QualityProvider } from "@stackcanon/quality-adapters";
import { detectInstalledMajor } from "@stackcanon/tooling-registry";
import { getSourceUrls } from "./sources.js";

export * from "./sources.js";

export interface PackManifest {
  readonly name: string;
  readonly displayName: string;
  readonly framework: FrameworkName;
  readonly versionRange: string;
  readonly supportedMajors: readonly number[];
  readonly qualityProviders: readonly QualityProvider[];
  readonly sources: readonly string[];
  readonly lastReviewed: string;
  readonly summary: string;
  readonly guidance: readonly string[];
  readonly focusAreas?: readonly string[];
  readonly reviewChecklist?: readonly string[];
}

export const supportedPacks: readonly PackManifest[] = [
  {
    name: "next-app-router",
    displayName: "Next.js App Router",
    framework: "next",
    versionRange: ">=15 <17",
    supportedMajors: [15, 16],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["next-docs", "next-ai-agents"]),
    lastReviewed: "2026-03-22",
    summary: "Server-first Next.js guidance for App Router projects with AI-facing project context.",
    guidance: [
      "Keep data fetching and mutation logic close to the server boundary before reaching for client-side state.",
      "Treat app/, layouts, and route handlers as framework-owned boundaries and avoid leaking client-only logic upward.",
      "Prefer safe Next config changes and revalidation-aware edits over broad rewrites."
    ]
  },
  {
    name: "nuxt-4",
    displayName: "Nuxt 4",
    framework: "nuxt",
    versionRange: ">=4 <5",
    supportedMajors: [4],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["nuxt-introduction", "nuxt-config", "nuxt-guide"]),
    lastReviewed: "2026-03-22",
    summary: "Nuxt guidance for server-first Vue applications with safe nuxt.config.ts changes and typed project setup.",
    guidance: [
      "Keep application behavior inside Nuxt conventions before reaching for custom build or runtime wiring.",
      "Treat nuxt.config.ts as infrastructure code and prefer small additive changes over broad rewrites.",
      "Use Nuxt type checking intentionally so Vue and server code stay aligned with generated app types."
    ]
  },
  {
    name: "vite-react",
    displayName: "React + Vite",
    framework: "vite-react",
    versionRange: ">=6 <9",
    supportedMajors: [6, 7, 8],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["vite-guide", "vite-config", "react-learn", "react-reference"]),
    lastReviewed: "2026-03-22",
    summary: "React + Vite pack focused on lightweight config, explicit plugins, and predictable DX.",
    guidance: [
      "Keep Vite config minimal and only add plugins the repo actually uses.",
      "Prefer framework-level conventions in src/ over build-time magic in vite.config.ts.",
      "Treat generated Vite config as a baseline, not a place for business logic."
    ]
  },
  {
    name: "vite-vue",
    displayName: "Vue + Vite",
    framework: "vite-vue",
    versionRange: ">=6 <9",
    supportedMajors: [6, 7, 8],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["vite-guide", "vite-config", "vue-guide", "vue-quick-start"]),
    lastReviewed: "2026-03-22",
    summary: "Vue + Vite pack with emphasis on simple build config and composition-first project rules.",
    guidance: [
      "Keep Vite config thin and move app behavior into Vue composition modules instead of build hooks.",
      "Avoid stacking overlapping tooling when one provider already covers linting and formatting.",
      "Review generated config before adding SSR or plugin-heavy behavior."
    ]
  },
  {
    name: "tanstack-start",
    displayName: "TanStack Start",
    framework: "tanstack-start",
    versionRange: ">=1 <2",
    supportedMajors: [1],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["tanstack-start-docs", "vite-config"]),
    lastReviewed: "2026-03-22",
    summary: "Full-stack TanStack Start guidance for server functions, routing, and SSR-aware file structure.",
    guidance: [
      "Keep server functions and route modules as the main data ownership boundary.",
      "Prefer TanStack Router and Start primitives over ad hoc client-side fetch orchestration.",
      "Treat Vite config changes carefully because they affect both dev ergonomics and server/runtime behavior."
    ]
  },
  {
    name: "tanstack-query",
    displayName: "TanStack Query",
    framework: "tanstack-query",
    versionRange: ">=5 <6",
    supportedMajors: [5],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["tanstack-query-react"]),
    lastReviewed: "2026-03-22",
    summary: "TanStack Query governance pack for query keys, server-state ownership, and invalidation discipline.",
    guidance: [
      "Keep server state in TanStack Query and avoid duplicating it in client stores without a clear reason.",
      "Design stable query keys first, then derive invalidation and mutation side-effects from that model.",
      "When compatibility mode is active, verify every cache and invalidation assumption against the nearest validated major."
    ]
  },
  {
    name: "nest",
    displayName: "NestJS",
    framework: "nest",
    versionRange: ">=10 <12",
    supportedMajors: [10, 11],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["nest-first-steps", "nest-cli"]),
    lastReviewed: "2026-03-23",
    summary: "NestJS backend pack focused on explicit module boundaries, Nest CLI workflows, and safe project-level config.",
    guidance: [
      "Keep controllers transport-focused and move business logic into explicit services or domain-oriented modules.",
      "Use Nest CLI and module conventions instead of ad hoc runtime wiring when StackCanon adds scripts or config.",
      "Treat nest-cli.json as workspace infrastructure and keep changes additive and predictable."
    ],
    focusAreas: ["module boundaries", "controller/service layering", "CLI-driven build flow"],
    reviewChecklist: [
      "Keep controllers thin and avoid embedding business logic in transport handlers.",
      "Prefer explicit modules and providers over cross-cutting god services.",
      "Validate DTO and contract boundaries before adding framework glue."
    ]
  },
  {
    name: "express",
    displayName: "Express",
    framework: "express",
    versionRange: ">=5 <6",
    supportedMajors: [5],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["express-installing", "express-routing"]),
    lastReviewed: "2026-03-23",
    summary: "Express backend pack for explicit entrypoints, minimal runtime scripts, and thin transport layers.",
    guidance: [
      "Keep Express apps thin at the routing layer and move business logic into services or domain modules.",
      "Prefer one explicit server entrypoint over scattered bootstrap logic.",
      "Use small, reversible script additions before introducing custom build tooling."
    ],
    focusAreas: ["single server entrypoint", "service extraction", "runtime script clarity"],
    reviewChecklist: [
      "Keep routing and middleware composition separate from business logic.",
      "Use one clear bootstrap file before introducing custom loaders or wrappers.",
      "Avoid TypeScript build scripts unless tsconfig.json is already present and owned intentionally."
    ]
  },
  {
    name: "fastify",
    displayName: "Fastify",
    framework: "fastify",
    versionRange: ">=5 <6",
    supportedMajors: [5],
    qualityProviders: ["ultracite", "biome", "oxlint", "skip"],
    sources: getSourceUrls(["fastify-getting-started", "fastify-typescript"]),
    lastReviewed: "2026-03-23",
    summary: "Fastify backend pack for clear server entrypoints, typed handlers, and minimal runtime configuration.",
    guidance: [
      "Keep Fastify registration and plugin boundaries explicit instead of mixing routing and domain logic together.",
      "Preserve Fastify’s typed request and reply flow when adding scripts or quality tooling.",
      "Prefer small runtime script baselines over premature build complexity."
    ],
    focusAreas: ["plugin boundaries", "typed handlers", "entrypoint discipline"],
    reviewChecklist: [
      "Keep plugin registration explicit and avoid hidden global side effects.",
      "Preserve typed request and reply flow when touching handlers or schemas.",
      "Avoid adding build-time complexity when a simple runtime script is enough."
    ]
  }
];

export interface ResolvedPack {
  readonly status: "validated" | "unsupported-major" | "missing";
  readonly pack?: PackManifest;
  readonly detectedMajor?: number;
}

export function resolvePack(framework: FrameworkName, version: string): ResolvedPack {
  const manifests = supportedPacks.filter((pack) => pack.framework === framework);
  if (manifests.length === 0) {
    return { status: "missing" };
  }

  const detectedMajor = detectInstalledMajor(version);
  if (detectedMajor === undefined) {
    return { status: "unsupported-major" };
  }

  const matchedPack = manifests.find((pack) => pack.supportedMajors.includes(detectedMajor));
  if (!matchedPack) {
    return {
      status: "unsupported-major",
      detectedMajor
    };
  }

  return {
    status: "validated",
    pack: matchedPack,
    detectedMajor
  };
}

export function getLatestPackForFramework(framework: FrameworkName): PackManifest | undefined {
  const manifests = supportedPacks.filter((pack) => pack.framework === framework);
  if (manifests.length === 0) {
    return undefined;
  }

  return [...manifests].sort((left, right) => {
    const leftMax = Math.max(...left.supportedMajors);
    const rightMax = Math.max(...right.supportedMajors);
    return rightMax - leftMax;
  })[0];
}
