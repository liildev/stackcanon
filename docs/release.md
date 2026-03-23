# Release Notes

## Current State

`StackCanon` has a working monorepo, testable CLI flows, and a bundling path for publishing `@stackcanon/cli`.

## What Is Ready

- `@stackcanon/cli` has a `bin` entry for `stackcn`
- workspace packages build to `dist/`
- CI can validate install, typecheck, test, and build

## Chosen Strategy

Publish only `@stackcanon/cli` and bundle its internal runtime dependencies.

Reason:
- end users only need `stackcn`
- internal packages can stay private and refactorable
- npm surface area stays small
- the public release story stays aligned with the actual product

## Implementation Notes

- workspace packages remain split for architecture and tests
- `packages/cli/tsup.config.ts` bundles internal `@stackcanon/*` runtime imports
- `@stackcanon/cli` keeps workspace packages in `devDependencies`, not publish-time runtime dependencies
- release PR workflow lives in `.github/workflows/release-pr.yml`
- trusted publish workflow lives in `.github/workflows/publish-cli.yml`
- trusted publishing on npm requires configuring the exact workflow filename on npmjs.com and using a compatible Node/npm runtime in CI

## Versioning Flow

1. create a changeset with `pnpm changeset`
2. merge changes into `main`
3. `.github/workflows/release-pr.yml` opens or updates the release PR
4. merge the release PR
5. run `.github/workflows/publish-cli.yml` through tag or manual trigger after npm trusted publisher is configured

The repo can keep `@stackcanon/cli` at an unreleased baseline version while the pending changeset describes the first public cut.

Prepared first-release notes live in `docs/releases/0.1.0.md` and `docs/releases/0.1.0-announcement.md`.

## Pre-Publish Checklist

- choose package visibility and license
- add release automation for versioning
- configure npm trusted publisher for `.github/workflows/publish-cli.yml`
- run real smoke checks for:
  - local tarball install via `pnpm --filter @stackcanon/cli smoke:tarball`
  - `stackcn generate --target ai-rulez --run-ai-rulez`
  - `stackcn sync`
  - `stackcn init --apply --install`
