# StackCanon

`stackcn` is the StackCanon CLI for existing JavaScript and TypeScript projects.

## Install

```bash
npm i -g @stackcanon/cli
```

One-off runs:

```bash
npx @stackcanon/cli doctor
bunx @stackcanon/cli doctor
```

## What It Does

- detects the current framework and quality-tool state
- applies safe stack-aware config patches
- generates canonical `ai/` context plus derived AI-tool outputs
- syncs official docs into `.stackcn/sources/`

## Main Commands

- `stackcn doctor`
- `stackcn init`
- `stackcn add`
- `stackcn generate`
- `stackcn sync`
- `stackcn revert`

## Workspace

- `apps/web`: future product website
- `packages/cli`: internal CLI source workspace
- `packages/core`: orchestration and init planning
- `packages/detectors`: project and dependency detection
- `packages/framework-adapters`: framework-specific policies and patch targets
- `packages/quality-adapters`: Biome, Oxlint, and Ultracite policies
- `packages/packs`: validated pack metadata and templates
- `packages/ai-engine`: AI output generation wrapper
- `docs/specs/v0.1.md`: first implementation scope

## Development

- `pnpm install`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm changeset`
- `pnpm release:status`
- `pnpm release:prepare`

## Current Status

This repository now contains:
- framework adapters for Next, Nuxt, Vite React, Vite Vue, TanStack Start, TanStack Query, Nest, Express, and Fastify
- quality adapters for Ultracite, Biome, and Oxlint
- canonical `ai/` generation plus derived `AGENTS.md`, `CLAUDE.md`, and `.ai-rulez/`
- official source sync into `.stackcn/sources/`
- shared JSON contracts used by the CLI and the internal `apps/web` inspector prototype
