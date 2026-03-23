export type SourceProduct =
  | "next"
  | "vite"
  | "react"
  | "vue"
  | "nuxt"
  | "nest"
  | "express"
  | "fastify"
  | "tanstack-start"
  | "tanstack-query"
  | "ultracite"
  | "biome"
  | "oxlint";

export type SourceRole =
  | "getting-started"
  | "config"
  | "routing"
  | "data"
  | "quality"
  | "ai"
  | "typescript"
  | "upgrade";

export interface SourceDocument {
  readonly id: string;
  readonly product: SourceProduct;
  readonly title: string;
  readonly url: string;
  readonly roles: readonly SourceRole[];
  readonly versionRange?: string;
  readonly lastVerified: string;
}

export const sourceRegistry: readonly SourceDocument[] = [
  {
    id: "next-docs",
    product: "next",
    title: "Next.js Docs",
    url: "https://nextjs.org/docs",
    roles: ["getting-started", "config", "routing", "data", "ai", "upgrade"],
    versionRange: ">=15 <17",
    lastVerified: "2026-03-22"
  },
  {
    id: "next-ai-agents",
    product: "next",
    title: "Next.js AI Coding Agents",
    url: "https://nextjs.org/docs/app/guides/ai-agents",
    roles: ["ai"],
    versionRange: ">=15 <17",
    lastVerified: "2026-03-22"
  },
  {
    id: "vite-guide",
    product: "vite",
    title: "Vite Guide",
    url: "https://vite.dev/guide/",
    roles: ["getting-started", "config"],
    versionRange: ">=6 <9",
    lastVerified: "2026-03-22"
  },
  {
    id: "vite-config",
    product: "vite",
    title: "Vite Config Reference",
    url: "https://vite.dev/config/",
    roles: ["config"],
    versionRange: ">=6 <9",
    lastVerified: "2026-03-22"
  },
  {
    id: "react-learn",
    product: "react",
    title: "React Learn",
    url: "https://react.dev/learn",
    roles: ["getting-started"],
    versionRange: ">=19 <20",
    lastVerified: "2026-03-22"
  },
  {
    id: "react-reference",
    product: "react",
    title: "React Reference",
    url: "https://react.dev/reference/react",
    roles: ["config", "typescript"],
    versionRange: ">=19 <20",
    lastVerified: "2026-03-22"
  },
  {
    id: "vue-guide",
    product: "vue",
    title: "Vue Guide",
    url: "https://vuejs.org/guide/introduction.html",
    roles: ["getting-started"],
    versionRange: ">=3 <4",
    lastVerified: "2026-03-22"
  },
  {
    id: "vue-quick-start",
    product: "vue",
    title: "Vue Quick Start",
    url: "https://vuejs.org/guide/quick-start.html",
    roles: ["getting-started", "config"],
    versionRange: ">=3 <4",
    lastVerified: "2026-03-22"
  },
  {
    id: "nuxt-introduction",
    product: "nuxt",
    title: "Nuxt Introduction",
    url: "https://nuxt.com/docs/4.x/getting-started/introduction",
    roles: ["getting-started", "config", "routing", "data", "upgrade"],
    versionRange: ">=4 <5",
    lastVerified: "2026-03-22"
  },
  {
    id: "nuxt-config",
    product: "nuxt",
    title: "Nuxt Configuration",
    url: "https://dev.nuxt.com/docs/getting-started/configuration",
    roles: ["config"],
    versionRange: ">=4 <5",
    lastVerified: "2026-03-22"
  },
  {
    id: "nuxt-guide",
    product: "nuxt",
    title: "Nuxt Guide",
    url: "https://nuxt.com/docs/guide",
    roles: ["getting-started", "typescript"],
    versionRange: ">=4 <5",
    lastVerified: "2026-03-22"
  },
  {
    id: "nest-first-steps",
    product: "nest",
    title: "NestJS First Steps",
    url: "https://docs.nestjs.com/first-steps",
    roles: ["getting-started", "config", "typescript"],
    versionRange: ">=10 <12",
    lastVerified: "2026-03-23"
  },
  {
    id: "nest-cli",
    product: "nest",
    title: "NestJS CLI Overview",
    url: "https://docs.nestjs.com/cli/overview",
    roles: ["config", "upgrade"],
    versionRange: ">=10 <12",
    lastVerified: "2026-03-23"
  },
  {
    id: "express-installing",
    product: "express",
    title: "Express Installing",
    url: "https://expressjs.com/en/starter/installing.html",
    roles: ["getting-started"],
    versionRange: ">=5 <6",
    lastVerified: "2026-03-23"
  },
  {
    id: "express-routing",
    product: "express",
    title: "Express Routing Guide",
    url: "https://expressjs.com/en/guide/routing.html",
    roles: ["routing", "config"],
    versionRange: ">=5 <6",
    lastVerified: "2026-03-23"
  },
  {
    id: "fastify-getting-started",
    product: "fastify",
    title: "Fastify Getting Started",
    url: "https://fastify.dev/docs/latest/Guides/Getting-Started/",
    roles: ["getting-started", "config"],
    versionRange: ">=5 <6",
    lastVerified: "2026-03-23"
  },
  {
    id: "fastify-typescript",
    product: "fastify",
    title: "Fastify TypeScript Reference",
    url: "https://fastify.dev/docs/latest/Reference/TypeScript/",
    roles: ["typescript", "config"],
    versionRange: ">=5 <6",
    lastVerified: "2026-03-23"
  },
  {
    id: "tanstack-start-docs",
    product: "tanstack-start",
    title: "TanStack Start Docs",
    url: "https://tanstack.com/start/docs/docs",
    roles: ["getting-started", "config", "routing", "data"],
    versionRange: ">=1 <2",
    lastVerified: "2026-03-22"
  },
  {
    id: "tanstack-query-react",
    product: "tanstack-query",
    title: "TanStack Query React Docs",
    url: "https://tanstack.com/query/v5/docs/framework/react",
    roles: ["getting-started", "data"],
    versionRange: ">=5 <6",
    lastVerified: "2026-03-22"
  },
  {
    id: "ultracite-docs",
    product: "ultracite",
    title: "Ultracite Docs",
    url: "https://docs.ultracite.ai/",
    roles: ["getting-started", "quality"],
    versionRange: ">=6 <7",
    lastVerified: "2026-03-22"
  },
  {
    id: "ultracite-v6-upgrade",
    product: "ultracite",
    title: "Ultracite v6 Upgrade",
    url: "https://docs.ultracite.ai/upgrade/v6",
    roles: ["upgrade", "quality"],
    versionRange: ">=6 <7",
    lastVerified: "2026-03-22"
  },
  {
    id: "biome-config",
    product: "biome",
    title: "Biome Configuration",
    url: "https://biomejs.dev/reference/configuration/",
    roles: ["config", "quality"],
    versionRange: ">=2 <3",
    lastVerified: "2026-03-22"
  },
  {
    id: "oxlint-config",
    product: "oxlint",
    title: "Oxlint Configuration File",
    url: "https://oxc.rs/docs/guide/usage/linter/config-file-reference.html",
    roles: ["config", "quality"],
    versionRange: ">=1 <2",
    lastVerified: "2026-03-22"
  }
];

export function getSourceDocument(id: string): SourceDocument | undefined {
  return sourceRegistry.find((entry) => entry.id === id);
}

export function getSourceDocuments(ids: readonly string[]): readonly SourceDocument[] {
  return ids.flatMap((id) => {
    const entry = getSourceDocument(id);
    return entry ? [entry] : [];
  });
}

export function getSourceUrls(ids: readonly string[]): readonly string[] {
  return getSourceDocuments(ids).map((entry) => entry.url);
}

export function getSourceDocumentsByUrls(urls: readonly string[]): readonly SourceDocument[] {
  const requested = new Set(urls);
  return sourceRegistry.filter((entry) => requested.has(entry.url));
}
