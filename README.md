# StackCanon

`StackCanon` is a stack-aware governance installer for existing JavaScript and TypeScript projects.

The first delivery target is the `stackcn` CLI. It detects the current stack, resolves validated packs, applies safe config patches, and generates AI-facing project context.

## Workspace

- `apps/web`: future product website
- `packages/cli`: `stackcn` binary
- `packages/core`: orchestration and init planning
- `packages/detectors`: project and dependency detection
- `packages/framework-adapters`: framework-specific policies and patch targets
- `packages/quality-adapters`: Biome, Oxlint, and Ultracite policies
- `packages/packs`: validated pack metadata and templates
- `packages/ai-engine`: AI output generation wrapper
- `docs/specs/v0.1.md`: first implementation scope

## Commands

- `pnpm install`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`

Core CLI flows:
- `stackcn doctor`
- `stackcn init`
- `stackcn add`
- `stackcn generate`
- `stackcn sync`
- `stackcn revert`

Release helpers:
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
