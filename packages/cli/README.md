# @stackcanon/cli

`stackcn` is the StackCanon CLI for existing JavaScript and TypeScript projects.

## Install

```bash
npm i -g @stackcanon/cli
```

## Quick Start

```bash
stackcn doctor
stackcn init
stackcn generate
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

## Supported Stacks

- Next.js
- Nuxt
- Vite React
- Vite Vue
- TanStack Start
- TanStack Query
- NestJS
- Express
- Fastify

## Supported Quality Providers

- Ultracite
- Biome
- Oxlint

## Links

- Repository: https://github.com/liildev/stackcanon
- Issues: https://github.com/liildev/stackcanon/issues
