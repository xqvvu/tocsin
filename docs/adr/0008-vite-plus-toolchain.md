# 0008 --- Migrate to Vite+ Unified Toolchain

## Status

Accepted (2026-09-27)

## Context

The previous toolchain (oxlint, oxfmt, vitest, tsdown) required separate configuration files and
per-tool invocations via pnpm scripts. Vite+ (vite-plus) wraps formatting, linting, testing,
building, type checking, and package management under a single CLI (`vp`), reducing toolchain
complexity in a monorepo workspace.

## Decision

- Replace oxlint, oxfmt, vitest, and tsdown with `vite-plus@1.0.0`.
- All lint and format configuration lives in workspace-root `vite.config.ts`; nested lint/format
  configs are disabled.
- CI uses `voidzero-dev/setup-vp@v1.21.1` instead of `actions/setup-node` + `pnpm/action-setup`.
- Docker builds use `ghcr.io/voidzero-dev/vite-plus:1.0.0` as the toolchain image.
- Server builds use Nitro v2 through `@tanstack/nitro-v2-vite-plugin`. The Nitro v3 beta Vite
  plugin activates for every `serve` command, which is what Vitest reports, so a test run would load
  Nitro's environments and dev middleware it never uses and log a spurious `ReferenceError: module
  is not defined` from React's CJS entry (`nitrojs/nitro#3659`, `#4144`, `#4661`); the v2 plugin
  only hooks `build`, so it stays inactive under `vp test` and needs no `VITEST` gate.
- Tests read the package `vite.config.ts`; there is no separate `vitest.config.ts`. TanStack Start
  and devtools stay unconditional; they do not affect `vp test`.
- Lint rules are scoped per workspace package via `lint.overrides` in the root `vite.config.ts`.

## Consequences

- CI no longer needs separate Node.js and pnpm setup steps; setup-vp handles both.
- Developers run `vp install`, `vp check`, `vp run -r test`, and `vp -C apps/console dev`.
- Old `.oxlintrc.json` and `.oxfmtrc.json` files have been deleted.
- The Docker build stage uses the vp image, which provisions the exact Node.js version from
  `.node-version` automatically.
