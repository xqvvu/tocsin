<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# AGENTS.md

This file is the working contract for agents changing Tocsin. Keep it focused on
how to work in this repository: ownership boundaries, architecture rules,
tooling, validation, and skill usage. Product scope, user stories, and detailed
architecture decisions live in `docs`.

## Reference Docs

Before product, architecture, auth, persistence, routing, delivery, or UI work,
read the relevant files under `docs`.

- `docs/prd/self-hosted-alert-hub-mvp.md` is the source of truth for MVP scope,
  domain language, testing expectations, and out-of-scope items.
- `docs/architecture/*` records architecture decisions and implementation
  shape. Update these docs when an architectural decision changes.

Do not copy PRD content into this file. If product behavior or architecture
changes, update the appropriate document under `docs` instead.

## Docs Workflow

- Write project docs in Chinese by default.
- After creating or updating docs, use the `obsidian-vault` skill to sync them
  into Obsidian.
- Do not hard-code the Obsidian vault path. Before syncing, discover the local
  vault location from the Obsidian configuration, then locate the existing Tocsin
  notes within that vault.
- Inspect the previously synced Tocsin notes, keep the same note naming/linking
  style, and migrate the project docs into the discovered Tocsin notes location.
- If the `obsidian-vault` skill is unavailable, say that the sync was skipped
  and continue with the repository change.

## Project Shape

- `apps/console` is the TanStack Start console. It owns UI, API routes, Better
  Auth integration, SQLite persistence, migrations, repositories/services,
  orchestration, oRPC procedures, and the in-process worker.
- `packages/core` owns shared schemas, domain types, route rules, delivery
  types, config types, JSON helpers, redaction helpers, and shared errors.
  Module-specific contracts live under `packages/core/src/<module>/`; cross-cutting
  helpers such as `json.ts`, `hash.ts`, and `redaction.ts` stay at the package
  root.
- `packages/providers` owns inbound provider parsers and the provider registry.
- `packages/destinations` owns outbound destination senders, templates, and the
  destination registry.

Third-party provider and destination adapters live in one directory per adapter.
Keep each integration's `index.ts` as a public barrel only; split config schema,
JSON-safe manifest, adapter wiring, payload rendering, and parse logic into
sibling files. Shared parsing or normalization helpers belong in a package-level
`shared/` module instead of being imported through another concrete integration.
Package roots aggregate these modules, and package manifests expose adapter
subpaths such as `@tocsin/providers/grafana` and `@tocsin/destinations/feishu`.

Keep reusable integration code in packages. Keep console runtime concerns in
`apps/console`. Do not introduce new deployable services, required middleware,
or distributed runtime assumptions without an explicit architecture document.

## Architecture Direction

Tocsin is a SQLite-first, single-process, self-hosted Alert Hub. Architecture work
should reinforce that shape instead of drifting toward SaaS, microservices, or
general workflow automation.

### Server-Side Composition

The backend is plain layered code, not a domain-model / hexagonal / clean
architecture. The layers are:

- entrypoints: API routes and oRPC procedures under
  `server/orpc/features/<capability>/router.ts` (the controller layer) validate
  input, check auth, and return safe DTOs.
- services: per-capability `*.service.ts` files (for example
  `server/sources/source.service.ts`) hold business logic. Exported service
  option/result types live next to the implementation in `*.service.types.ts`.
- repositories: `infra/sqlite/repositories/<module>/` files own persistence
  contracts and SQLite implementations, split per module into `*.interface.ts`
  (types + repository interface), `*.helpers.ts` (row mapping and shared
  helpers), and `*.repository.ts` (SQLite implementation class).

Wire dependencies explicitly. Do not reach for a DI framework.

- Assemble long-lived server dependencies in one server-only wiring object, the
  application container (`server/runtime/container.ts`). This is where SQLite
  store access, provider registry, destination registry, services, worker
  dependencies, auth wiring, and runtime configuration come together. The
  container exposes one factory per service, such as `createSourceService` and
  `createDestinationService`; there is no single aggregate configuration
  service.
- Keep request-level data out of the container. Current dashboard user, session,
  request id, locale, and per-request audit data belong in the per-request
  context the entrypoint builds.
- Give services plain constructors that take explicit dependencies, so they stay
  testable with fake stores, registries, clocks, and senders.
- Do not add module-level service singletons like
  `export const sourceService = ...`. Hide any remaining global runtime state
  behind narrow server-only accessors or the container.
- Do not add NestJS-style decorator IoC, reflection, or a third-party DI
  container. TanStack Start runtime lifecycles, HMR, serverless execution, and
  request isolation make magic DI a poor fit here.
- Keep entrypoints thin: validate input, establish request or webhook context,
  get the service it needs, call it, and return a safe DTO. In an oRPC router,
  declare the dependency once with
  `withDashboardService((container) => container.createXService())` and let the
  handler call `context.service.<method>(input)`. Do not reach through
  `context.dashboardRequest.container` from a handler unless the procedure needs
  the container itself.
- Services express domain failures with domain error classes, never with
  transport errors. Repositories raise `RecordNotFoundError`; services raise
  `DomainValidationError` for domain-level validation. `server/orpc/errors.ts`
  is the single place that translates them to oRPC codes at the boundary, so a
  missing record becomes a 404 with its message intact instead of an opaque 500.
  Do not throw `ORPCError` from a `*.service.ts`.

Dashboard auth and webhook auth are separate paths:

- Dashboard routes, loaders, oRPC procedures, and API routes that touch
  user-owned data or runtime configuration must verify dashboard auth on the
  server.
- Webhook intake endpoints authenticate with Source tokens or Tocsin-side additional shared secrets,
  not browser dashboard sessions.

### Frontend Architecture

Use route-first frontend architecture with feature modules. Do not create a
frontend DI container.

Recommended shape inside `apps/console/src`:

```txt
shell               dashboard layout, sidebar, header, user menu
components/ui       shadcn primitives only; no Tocsin domain knowledge
components/common   reusable console UI, no feature ownership or server state
features            Sources, Routes, Destinations, Events, Deliveries, Integrations, Settings
routes              file routes, layouts, validateSearch, loaders, thin screens
server              server-only: orpc/ implementer + routers, per-capability *.service.ts/*.service.types.ts, runtime wiring, intake, deliveries, integrations, oncall
infra               SQLite connection, migrations, codecs, store assembly, repositories, and server-only runtime infrastructure
lib                 small shared helpers; split same-name .server/.client pairs only when needed
```

Shared client/server contracts (command schemas, DTOs, result/projection types)
live in the `@tocsin/core` package, not a console-level folder. Server-only types
that only the backend consumes stay next to the code that uses them, such as the
dashboard session types in `server/runtime/`.

Route files should own URL concerns:

- file route definitions
- pathless layouts
- `validateSearch`
- `loaderDeps`
- route loaders that prefetch query data
- `beforeLoad` for user-experience redirects
- rendering a feature page or shell component

Route files should not own complex forms, table models, destination test logic,
route-rule editing, delivery orchestration, or persistence.

Feature modules should own domain UI and client-safe data boundaries:

```txt
features/sources/
  api/       orpc call wrappers, queryOptions, mutation helpers
  model/     schemas, form values, view models, DTO types
  ui/        SourcesPage, SourceTable, SourceForm, source actions
```

Use this pattern for Sources, Routes, Destinations, Events, Deliveries, and
configuration/settings as they grow. Route-colocated `routes/-*.ts(x)` files are
acceptable only for truly route-local helpers. Promote reusable domain code to
`features/*`.

Use `components/common` for reusable console-level UI that is shared across
features but is not a shadcn primitive: operational table shells, pagination,
copyable code lines, generic form/content panels, tooltips, and generic
enabled/disabled badges. These components may encode Tocsin console density and
layout conventions, but they must not own Source/Destination/Event/Delivery
business rules, call oRPC procedures, read query state, or import server-only
modules. Feature-specific cells, actions, empty states, provider/destination
badges, route coverage summaries, and delivery state badges stay in
`features/*`.

Within feature `ui/` folders, prefer one exported React component per file. If
a component grows meaningful child components such as table cells, row actions,
empty states, toolbars, dialogs, form shells, or notice panels, split those
children into named sibling files instead of keeping a large component cluster
in one file. Small private render helpers and style helpers may stay colocated
when they are not reusable components.

### Frontend i18n

- Use a single translation function per component or helper scope:
  `const t = useTranslations();`.
- Put the namespace in the message key, such as
  `t("common.actions.refresh")` or `t("sources.form.nameLabel")`.
- Do not create multiple namespaced translation variables in the same scope,
  such as `tActions`, `tRoutes`, `statusT`, or
  `useTranslations("common.actions")`, unless an exceptional case is documented
  next to the call.
- Keep machine values, API enum values, route ids, and persistence values
  untranslated; translate only their display labels at the UI boundary.
- Chinese UI copy should use SRE/operator domain language instead of literal
  word-for-word translation. Prefer terms an on-call engineer would expect in
  an alert routing console, keep sentences short and action-oriented, and avoid
  half-translated phrases unless the English token is an established technical
  term.
- For the Sources surface, translate the product concept `Source` as
  `告警源`, not `来源`. Use `接入` for intake, `接入 Token` for source token,
  `告警解析器` for provider parser, `上游监控系统` for upstream provider/sender
  context, `Webhook 请求体` or `告警载荷` for payload depending on the UI
  context, and `路由规则` for user-facing route rules. Keep provider names such
  as Grafana, SigNoz, Uptime Kuma, Alertmanager, and protocol/config terms such
  as Webhook, JSON, URL, Token, TOML, and API in English when that is clearer.

### oRPC Boundary

The oRPC contract + router is the client/server boundary for console data.

- Browser code reaches the server only through `#/lib/orpc`
  (`orpc.<namespace>.<procedure>.queryOptions(...)` / `.call`). It must never
  import `#/server/orpc/**` or a capability service directly.
- Contract definitions live in `packages/api`; the matching implementer lives in
  `apps/console/src/server/orpc`. The two must stay in step, and the type checker
  enforces it.
- Default to no import-protection marker. Most modules are environment-neutral
  and need neither a `server-only` / `client-only` side-effect import nor a
  `.server` / `.client` suffix.
- Add `import "@tanstack/react-start/server-only";` only when the module's own
  code directly imports or uses a server-exclusive API: a `node:*` builtin, the
  SQLite driver, the filesystem, `process.env` / secret config, or `better-auth`
  server runtime. Do not mark a module just because it is conceptually
  server-side or because it imports another server module.
- Add `import "@tanstack/react-start/client-only";` only when the module's own
  code directly uses a browser-exclusive global or API, such as `window`,
  `document`, `navigator`, `localStorage`, or the DOM.
- The build enforces transitivity: if client-safe code is ever pulled into a
  chain that reaches a marked module (or a `node:*` builtin), TanStack Start
  import protection fails the build. That tripwire at the real boundary is the
  protection; intermediate neutral modules do not need their own marker.
- Use `.server.ts(x)` / `.client.ts(x)` suffixes only when matching files need
  the same basename to distinguish environment-specific implementations, such as
  `auth.server.ts` and `auth.client.ts`. The suffix is itself the marker, so do
  not also add a `server-only` / `client-only` side-effect import inside it.
- A module that carries a marker, or a `.server` / `.client` suffix, must not be
  imported by code from the other environment.
- `*.schema.ts`, `*.types.ts`, and `*.model.ts` stay shared as long as their own
  imports remain environment-neutral.
- Keep command schemas, input validators, DTO types, and other client-safe
  contracts in the `@tocsin/core` package, the `@tocsin/api` contract package, or
  feature `model/*` files when they are reused outside a server-only
  implementation. Console-level command schemas and operation DTOs live in
  `@tocsin/core`.
- `@tocsin/core` and feature `model/*` contracts must stay environment-neutral.
  They must not import `node:*`, `#/infra/*`, `#/server/*`,
  `#/lib/auth.server.ts`, modules marked with TanStack Start import protection,
  or modules with `.server` / `.client` suffixes.
- Router files under `server/orpc/features/<capability>/` are the only
  server-only entrypoints for dashboard data. They may import the contract,
  middleware, and `#/server/runtime/*`; they may not call runtime functions at
  module initialization.
- Private procedures declare their service dependency once with
  `withDashboardService((container) => container.createXService())` and call
  `context.service.<method>(input)`. Use bare `requireDashboard()` only when the
  procedure needs the container itself.
- Public procedures that cannot use the throwing guard (for example
  `auth.getDashboardSession`) use the tolerant `findDashboardContext()` and
  return nullable state.
- Procedures must validate inputs and perform their own server-side auth checks
  when returning private dashboard data.
- Procedures should return DTOs shaped for UI needs. Do not return database rows,
  token hashes, raw secret config, destination secrets, provider signing
  secrets, or unredacted sensitive payloads.
- Routers must not translate domain errors themselves. Services raise
  `RecordNotFoundError` / `DomainValidationError` and `server/orpc/errors.ts`
  maps them at the boundary; see the composition rules above.

TanStack Router loaders are not a persistence boundary. Loaders must not import
SQLite stores, env secret modules, server-only containers, or filesystem code.
Use route loaders to call `queryClient.ensureQueryData(...)` with feature
`queryOptions`; those query functions may call oRPC procedures.

## State Ownership

Use the TanStack stack deliberately:

- Server state: Sources, Routes, Destinations, Events, Deliveries, settings,
  list data, detail data, previews, and test results live in TanStack Query.
- URL state: durable filters, search text, selected status, pagination cursors,
  tabs, and comparable table state live in TanStack Router search params.
- Form state: non-trivial Source, Destination, Route, auth, settings, TOML, and
  schema-backed config forms use TanStack Form.
- Table state: dense operational tables use TanStack Table. Sync only durable
  user intent, such as filters or pagination, to the URL.
- Local UI state: dialog open/closed, sheet open/closed, copied-token notices,
  temporary form drafts, and transient toasts may use React state.
- Global client state libraries such as Zustand or Jotai are not default
  dependencies. Add one only with a documented need.

## TanStack Suite

Tocsin's console is a TanStack Start app. Treat Router, Query, Form, Table, and
Start as one integrated stack.

- Use TanStack Router file routes for navigable console screens and layouts.
- Keep generated route-tree files generated. Do not hand-edit
  `apps/console/src/route-tree.gen.ts`.
- Validate URL search params before using them as filters, pagination, selected
  rows, or tab state.
- Use route loaders for route-level prefetching and TanStack Query for
  cacheable server state, mutations, invalidation, prefetching, and shared
  loading/error states.
- Keep query keys structured, serializable, and scoped by entity plus every
  variable that affects the result.
- Prefer `queryOptions` factories in feature `api/*.queries.ts` files. Reuse
  the same query options in route loaders and feature components.
- Use targeted query invalidation after mutations. Do not rely only on full
  router invalidation when a precise query key is available.
- Use TanStack Form for non-trivial forms, especially Sources, Destinations,
  Routes, auth, settings, TOML import/export, and schema-validated config blobs.
- Use TanStack Table for dense operational tables, including sorting, filters,
  pagination, row selection, column visibility, and reusable table state.
- Use API routes for external webhook endpoints.
- Keep SQLite, filesystem, env secrets, auth server internals, and runtime
  infrastructure server-only.

Use the matching TanStack skills before changing these areas:

- `tanstack-start-best-practices`: server functions, API routes, middleware,
  SSR, hydration, route protection, auth boundaries, environment access,
  deployment adapters, and client/server file separation.
- `tanstack-router-best-practices`: file routes, layouts, navigation, loaders,
  search params, route context, preloading, redirects, and not-found or error
  routes.
- `tanstack-query-best-practices`: data fetching, query keys, mutations,
  invalidation, caching, optimistic updates, SSR query hydration, and server
  state error handling.
- `tanstack-form`: form state, field validation, submission flows, dynamic
  fields, schema adapters, and reusable form patterns.
- `tanstack-table`: table columns, row models, sorting, filtering, pagination,
  grouping, expansion, row selection, column visibility, and headless table
  state.

## UI Direction

Tocsin is an operational SRE tool. Favor dense, calm, repeat-use interfaces:
tables, filters, detail pages, drawers/sheets, explicit enabled/disabled
controls, and test actions for Sources and Destinations. Avoid marketing-style
layouts, oversized hero sections, decorative dashboards, and visual novelty.

Keep the visual system compact and utilitarian:

- Use small text, tight controls, neutral surfaces, restrained borders, and
  mostly square corners.
- Prefer tables, filters, tabs, sheets/drawers, forms, empty states, inline
  actions, and reviewable destructive flows over large overview cards.
- For configuration list pages such as Sources and Destinations, align table
  shells, pagination, status presentation, row height, and action density
  through `components/common`; keep the column content itself in the owning
  feature.
- Destinations tables should surface operator-visible facts first: target
  identity, adapter kind, enabled/disabled status, enabled route coverage,
  operational configuration (endpoint URL, method, recipients, template mode),
  and explicit test/preview/edit/toggle actions. Tocsin is a private self-hosted
  product: authenticated dashboard operators should see the config they need to
  run on-call workflows. Still never return signing secrets, passwords, Source
  tokens, token hashes, or sensitive header values into list/query data. Recent
  delivery health belongs in the Destinations table only after a server-side
  summary DTO exists.
- Make destructive, delivery, test, retry, secret, and token-related actions
  explicit.
- Do not introduce one-off styling systems, icon sets, chart libraries, or
  animation layers unless the existing stack cannot cover the product need.
- Keep loading skeletons colocated with the component they stand in for. Expose
  them as static component properties such as `LoginForm.Skeleton`,
  `DashboardUserMenu.Skeleton`, or `DashboardContentLayout.Skeleton`; route
  `pendingComponent`, `ClientOnly` fallback, and `React.Suspense` fallback
  should reference those properties instead of importing from a shared
  `loading-skeletons` grab bag. If the real component must stay lazy or
  client-only, keep a server-safe wrapper next to it, put the skeleton on that
  wrapper, and lazy-load the client implementation through
  `createClientOnlyFn`. Do not import a `*.client.tsx` file from a wrapper that
  is itself imported by server-rendered routes, because TanStack Start import
  protection still traces that dynamic import.

## shadcn UI

Use shadcn for shared UI primitives and app composition.

- Before adding, inspecting, composing, fixing, or styling shadcn components,
  open `shadcn` or `shadcn-ui` and follow its workflow.
- Run shadcn CLI commands from `apps/console`, so the CLI reads
  `apps/console/components.json`.
- Use the workspace package runner. Always `npx shadcn@latest ...` unless
  an existing script or skill specifies a more precise command.
- Use `npx shadcn@latest info` or `info --json` to inspect local config
  before adding registry items or applying examples.
- Follow the current config: `style` is `base-lyra`, `baseColor` is `neutral`,
  `iconLibrary` is `remixicon`, menu color is `default`, menu accent is
  `subtle`, Tailwind CSS entry is `src/styles.css`, and aliases come from
  `components.json`.
- Use configured aliases, especially `#/components/ui` for primitives and
  `#/lib/utils` for utilities.
- Prefer existing primitives and registry items over custom markup. Common
  surfaces should use components such as `Button`, `Field`, `Input`,
  `NativeSelect`, `Table`, `Separator`, `Badge`, `Skeleton`, `Alert`, `Empty`,
  `Tabs`, `Dialog`, `Sheet`, or `Drawer` when available.
- For forms, let TanStack Form own behavior and let shadcn Field primitives own
  presentation. Use `FieldGroup` + `Field`, `FieldSet` + `FieldLegend`, and
  `data-invalid`/`aria-invalid` validation display.
- For tables, let TanStack Table own columns and row models. Let shadcn
  `Table`, `Button`, `Input`, `DropdownMenu`, `Checkbox`, `Badge`, `Skeleton`,
  and `Empty` own rendering and controls.
- Compose primitives with required accessibility parts: titles for
  dialogs/sheets/drawers, grouped menu/select/command items, `AvatarFallback`,
  semantic labels, invalid states, and disabled states.
- Use Remix Icon components for action icons unless a nearby local component
  already establishes another convention.
- Use semantic tokens and variants before custom colors or typography classes.
  Keep raw Tailwind color overrides rare and justified.
- For frontend changes that materially affect UI behavior or layout, verify in
  a browser when a local dev target is available.

## Security And Data Exposure

Tocsin is self-hosted, not multi-tenant SaaS. Prefer operational visibility for
authenticated dashboard operators; only true secrets stay out of browser state.

- Keep Source tokens, token hashes, additional shared secrets, destination
  signing secrets, SMTP/gateway passwords, and sensitive Authorization header
  values server-side (or empty on edit with preserve/replace/clear semantics).
- Operational destination fields (endpoint URL, method, recipients, template
  mode/source, header names) may appear in authenticated dashboard list/detail
  DTOs so SRE can verify configuration without opening the database.
- Redact sensitive keys inside raw provider payloads/headers and transport
  response bodies before ordinary debug UI display or logging.
- Do not expose Source tokens, signing secrets, passwords, token hashes, or
  sensitive header values through route loader data, client components, query
  data, route context, serialized route data, default TOML exports, or console
  logs.
- Mark the modules that directly touch secrets or server-exclusive APIs
  (`node:*`, the SQLite driver, filesystem, `process.env` / secret config,
  `better-auth` server runtime) with `import "@tanstack/react-start/server-only";`
  (or a `.server.ts(x)` suffix for same-basename pairs). These markers at the
  real boundary make the build fail if client-safe code ever reaches them; do
  not pre-emptively mark neutral wrapper modules.
- Mark the modules that directly use browser-exclusive globals or APIs with
  `import "@tanstack/react-start/client-only";` (or a `.client.ts(x)` suffix for
  same-basename pairs).
- Treat `beforeLoad` route guards as user-experience guards only. They do not
  replace server-side authorization in oRPC procedures or API routes.
- Validate all external input, config blobs, route rules, TOML input, webhook
  payloads, and raw provider data at the boundary.

## SQLite And Migrations

- Put SQLite schema code in `apps/console/src/infra/sqlite/migrate/`.
- Apply migrations through the public API in
  `apps/console/src/infra/sqlite/migrate/index.ts` (imported as `#/infra/sqlite/migrate`).
- Record applied migrations in `schema_migrations`.
- During MVP, the database schema is not stable yet. `migrate/0001_initial_schema.ts`
  is the baseline for fresh databases; deployed databases are upgraded through
  forward steps such as `0002_suppressions.ts` and `0003_complete_legacy_schema.ts`.
  Never edit a migration that may already be recorded.
- Add new schema changes as forward-only steps registered in `migrate/plan.ts`;
  do not fold them into `0001`.
- Prefer Kysely schema/query builders for schema code. Keep Better Auth CLI
  output beside the builders as a generated reference snapshot, not as runtime
  SQL that business code executes directly.
- Use one consistent timestamp representation across tables.
- Business code should not scatter schema creation. Route handlers and server
  functions should delegate persistence to repositories or services.

## Imports

- In `apps/console`, import console source through the configured alias: `#/*`.
  Example: `import { cn } from "#/lib/utils";`
- Use relative imports only for same-directory package internals, generated
  route-tree files, or colocated tests where an alias would make ownership less
  clear.
- Import workspace packages through their package names, such as `@tocsin/core`,
  `@tocsin/providers`, and `@tocsin/destinations`.
- Inside workspace packages, use the package-specific internal aliases
  `#core/*`, `#providers/*`, and `#destinations/*`; reserve `#/*` for the
  console so aliases remain unambiguous when TypeScript follows workspace
  package source.
- Omit `.ts` and `.tsx` extensions from TypeScript import specifiers. Keep
  semantic filename suffixes such as `.server`, `.client`, and `.service`.
  TanStack Start currently generates two extension-bearing type imports in
  `route-tree.gen.ts`; treat that generated file as the only exception and do
  not hand-edit it.
- Keep server-only imports out of client components, feature UI, route loaders,
  query option files, and serialized route data.
- Keep environment-specific imports out of shared contracts and out of the
  static import chain of the oRPC routers that `#/lib/orpc.ts` imports. If a
  shared schema/type needs something from a server-only module, move the shared
  part upward instead of weakening import protection.
- Keep `.server` / `.client` suffixes rare and pair-driven. For one-off
  server-only or browser-only modules, use a normal filename plus the matching
  TanStack Start side-effect import.

## Toolchain

The workspace runs on the Vite+ CLI (`vp`). Vite, Vitest, Oxlint, Oxfmt, and
task orchestration all go through that one entrypoint, so do not call
`oxlint`, `oxfmt`, or `vitest` directly and do not add a second toolchain
runner. `vite-plus` is a root devDependency; run `vp install` once from the
workspace root before using it.

- Runtime: Node `26.x`, pinned by the committed `.node-version`.
- Package manager: `pnpm@12.14.0`, declared in root `package.json`.
- Install: `vp install` (or `vp install --frozen-lockfile` in CI).
- Format: `vp fmt --write` to fix, `vp fmt --check` to verify.
- Lint: `vp lint` (add `--fix` to write fixes).
- Tests: `vp run -r test` for the workspace, `vp -C <dir> test run` for one
  package.
- Build: `vp run -r build` for the workspace, `vp -C <dir> build` for one
  package.
- Full check: `vp check` runs formatting, lint, and type checks together.
- Dev server: `vp -C apps/console dev`.

Lint and format settings live only in the workspace-root `vite.config.ts`.
Vite+ disables nested lint and format configs, so package-specific rules and
format options belong in the root `lint.overrides` and `fmt.overrides`
blocks, keyed by workspace globs such as `apps/console/**`. A package
`vite.config.ts` should only carry Vite, framework, and runtime settings.

Prefer package-scoped commands while working on a focused area. Run broader
checks when touching shared packages or cross-package contracts, and run
`vp check` plus `vp run -r test` before handing work back. The pre-commit
hook runs `vp staged` from `.vite-hooks/`.

## Local Browser Preview

- Before starting a dev server for browser preview or frontend verification,
  inspect the currently listening ports and reuse an existing Tocsin console dev
  server when one is already running.
- Reuse the existing server's exact port. For example, if the console is
  already available on port `6180`, use that server instead of starting another
  instance on `6181` or any other port.
- When a new dev server is actually required, bind it to `localhost`; do not
  start it with `127.0.0.1` as the host.
- Browser, Computer Use, Browser MCP, and Chrome DevTools MCP navigation must
  use `http://localhost:<port>`, never `http://127.0.0.1:<port>`.
- Do not treat an occupied port as a reason to start a second server until you
  have verified that the existing listener is not a usable Tocsin console dev
  server.

## Browser Test Credentials

- When local browser automation or Computer Use needs to create or sign in to a
  dashboard account, use `admin@example.test` with password `111111aa`.

## Engineering Workflow

- Read surrounding code before changing it.
- Keep changes narrow and aligned with existing local patterns.
- Prefer schema-validated boundaries for external input, config blobs, route
  rules, raw payloads, and portable config.
- Keep entrypoints thin; delegate persistence, orchestration, routing,
  delivery, and secret handling to repositories or services.
- Add or update tests when behavior, schemas, migrations, routing, delivery,
  providers, destinations, oRPC procedures, auth, query keys, URL state, forms,
  or tables change.
- Do not add new toolchain requirements for narrow changes; use the scripts
  already declared in package manifests.
- If moving code into `features/*`, keep the move behavior-preserving first.
  Refactor behavior in a separate, test-covered step.

## Skill Usage

Skills are mandatory routing, not optional reading. Before doing substantive
work, check the user's request and the code area against `.agents/skills`. If a
local skill matches the task, open that skill's `SKILL.md` or `SKILL.MD` and
follow it. Do not skip a matching skill because the task looks small, familiar,
or faster to do from memory.

Use the smallest set of skills that covers the request, but compose skills when
the task crosses domains. Examples:

- Auth UI work can require `better-auth-best-practices`,
  `email-and-password-best-practices`, `tanstack-start-best-practices`,
  `tanstack-form`, and `shadcn`.
- Data-heavy console screens can require `tanstack-router-best-practices`,
  `tanstack-query-best-practices`, `tanstack-form`, `tanstack-table`, and
  `shadcn`.
- Frontend architecture or route splitting can require
  `tanstack-router-best-practices`, `tanstack-query-best-practices`, and
  `shadcn`.
- Server-side container, request context, oRPC procedures, or API routes can
  require `tanstack-start-best-practices`.
- Stitch-to-React work can require `stitch::generate-design`,
  `react-components`, and `shadcn`.

When no skill matches, proceed normally and say so briefly if the user
explicitly asked about skills.

Required skill triggers:

TanStack and app boundaries:

- `tanstack-start-best-practices`: server functions, API routes, middleware,
  SSR, hydration, route protection, full-stack boundaries, deployment adapters,
  environment access, and client/server file separation.
- `tanstack-router-best-practices`: file routes, layouts, navigation, loaders,
  search params, route context, preloading, redirects, and not-found or error
  routes.
- `tanstack-query-best-practices`: data fetching, query keys, mutations,
  invalidation, caching, optimistic updates, SSR query hydration, and shared
  server state.
- `tanstack-form`: forms, validation, submission state, field arrays, dependent
  fields, and schema-backed form values.
- `tanstack-table`: sortable, filterable, paginated, grouped, expandable,
  selectable, virtualized, or column-configurable tables and data grids.
  Compose it with Router, Query, and shadcn when the table also owns URL state,
  server state, or UI primitive composition.

Auth and security:

- `better-auth-best-practices`: Better Auth configuration, `auth.ts`, auth
  client, session handling, database adapter, OAuth provider, plugin setup, or
  auth environment variable work.
- `create-auth-skill`: adding authentication to a TypeScript or JavaScript app.
  Use its planning workflow before implementation unless the user explicitly
  provides all missing decisions.
- `email-and-password-best-practices`: email/password login, sign-up, email
  verification, password reset, password policy, credential security, or email
  callback flows.
- `two-factor-authentication-best-practices`: MFA, 2FA, TOTP, OTP, backup
  codes, trusted devices, or Better Auth `twoFactor` plugin work.
- `organization-best-practices`: organization, tenant, team, invitation,
  member, role, permission, or RBAC work with Better Auth.
- `better-auth-security-best-practices`: auth hardening, rate limiting, CSRF,
  trusted origins, secure cookies, secret management, OAuth token encryption,
  IP tracking, audit logging, or production auth security review.

UI, design, and generated screens:

- `shadcn` or `shadcn-ui`: adding, inspecting, composing, fixing, or styling
  shadcn/ui components, registry items, blocks, forms, dialogs, tables, or
  component-system primitives.
- `stitch::generate-design`: generating or editing screens with Stitch,
  creating design variants, turning prompts or images into screens, or updating
  `.stitch/designs`.
- `stitch::manage-design-system`: creating, updating, extracting, or applying a
  Stitch design system, or changing `.stitch/DESIGN.md` and Stitch
  design-system metadata.
- `stitch-loop`: continuing an iterative Stitch site/app build driven by
  `.stitch/next-prompt.md`, `.stitch/SITE.md`, and `.stitch/DESIGN.md`.
- `enhance-prompt`: improving a vague UI/design prompt, especially before
  sending it to Stitch.
- `react-components`: converting Stitch-generated designs into modular React
  components, validating generated TSX, or synchronizing `.stitch/designs` with
  implementation.

Planning, review, and architecture:

- `design-an-interface`: designing a module API, comparing interface shapes, or
  whenever the user asks to "design it twice" or explore alternatives before
  implementation.
- `improve-codebase-architecture`: looking for deeper refactoring
  opportunities, reducing coupling, improving testability, or assessing
  architecture against `docs`, ADRs, and domain language.
- `grill-me`: stress-testing a plan or design through questioning.
- `grill-with-docs`: stress-testing a plan against project docs, domain
  vocabulary, `CONTEXT.md`, or ADRs, and updating docs as decisions solidify.
- `review`: reviewing a branch, PR, work-in-progress diff, or changes since a
  commit, tag, branch, or merge-base. Use the skill's standards/spec split.
- `to-prd`: turning the current conversation and repo context into a PRD.
- `to-issues`: breaking a plan, PRD, or feature into independently grabbable
  tracker issues.

Skill workflow rules:

- Announce the skill or skills being used in one short sentence before applying
  them.
- Read only the relevant skill instructions and directly referenced files
  needed for the current task.
- Follow required pauses, confirmations, sub-agent steps, validation scripts,
  and artifact updates described by the skill.
- If a named or clearly matching skill is missing, unreadable, or blocked by an
  unavailable tool, say so and continue with the closest safe fallback.
- Do not carry a skill across turns unless the user asks for it again or the
  new request still clearly depends on the same skill.

## MCP Usage

MCP tools are the preferred source of truth for external systems, registries,
design tools, and issue trackers. When a relevant MCP exists, use it instead of
guessing from memory or manually reconstructing remote state. Discover
available MCP tools first through the active tool-discovery mechanism, then use
the exact tool prefix returned by that discovery.

Required MCP triggers:

- Stitch MCP: use for Stitch projects, screens, variants, design systems,
  `outputComponents`, screen metadata, and asset download URLs. Update
  `.stitch/metadata.json` after creating or changing Stitch projects or
  screens, and store downloaded design assets under `.stitch/designs`.
- shadcn MCP: use for registry search, item lookup, examples, audit checklists,
  and install-command discovery. Use `npx shadcn@latest info` from
  `apps/console` for local project configuration because the shadcn MCP does
  not replace local config inspection.
- Browser or Chrome DevTools MCP: use for meaningful frontend verification
  after UI changes when a local dev target is available, and for Stitch visual
  fidelity checks when the relevant browser MCP is installed.
- Better Auth MCP or official Better Auth docs tooling: use for current Better
  Auth API details, CLI behavior, plugin syntax, migrations, and security
  options whenever auth code or auth configuration changes.
- Issue tracker or GitHub MCP: use when publishing PRDs, creating issues,
  reading issue/PR context, or reviewing changes against a referenced tracker
  item.
- Multi-agent MCP/tools: use when the selected skill requires parallel
  sub-agents, especially `review`, `design-an-interface`, and
  `improve-codebase-architecture`.

MCP workflow rules:

- Do not invent MCP tool names. Discover them, then call the discovered names.
- If a skill references an MCP namespace such as `stitch*:*` or `mcp_shadcn*`,
  treat that as a requirement to look for those tools before falling back.
- Prefer MCP reads over web search for project-connected systems. Use web
  search only when no project MCP is available or the skill explicitly requires
  current public documentation.
- If an MCP is unavailable, state the missing capability, use the safest local
  or official-doc fallback, and avoid pretending remote state was verified.
