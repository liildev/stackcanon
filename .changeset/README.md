# Changesets

StackCanon uses Changesets to manage version intent for the public CLI package.

## Current Policy

- only `@stackcanon/cli` is versioned for publish
- internal workspace packages stay private
- release PRs update CLI version and changelog metadata
- actual npm publishing remains a separate trusted-publishing workflow

## Main Commands

- `pnpm changeset`
- `pnpm release:status`
- `pnpm version-packages`
