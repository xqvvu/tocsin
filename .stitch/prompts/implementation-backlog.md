# Tocsin UI Implementation Backlog

This backlog starts after the Stitch design system is uploaded and the first
Events screen is generated, reviewed, and accepted with
`.stitch/prompts/design-qa.md`.

Keep the implementation route-first, feature-module based, and shadcn
semantic-token driven. Do not copy Stitch hex values into app components.

## Phase 0: Design Intake

1. Upload `.stitch/DESIGN.md` to the Stitch project and create the design
   system.
2. Generate the Events Operations Page from
   `.stitch/prompts/ready-to-run.md`.
3. Download the Events screenshot and HTML into `.stitch/designs`.
4. Update `.stitch/metadata.json` with the screen ID, screenshot path, HTML path,
   design-system asset ID, and review notes.
5. Review the screen against `.stitch/prompts/design-qa.md`.

Exit criteria:

- The Events screen keeps the shadcn neutral, compact, operational style.
- The shell, filters, table, and detail panel map cleanly to existing code.
- Raw/debug data is redacted.
- No product-scope drift appears in the screen.

## Phase 1: shadcn Primitive Preparation

Install only the primitives needed by the accepted Stitch screen.

Likely first batch:

```sh
npx shadcn@latest add @shadcn/tabs @shadcn/empty @shadcn/alert @shadcn/dropdown-menu @shadcn/tooltip @shadcn/skeleton
```

Use `@shadcn/sheet` only if the accepted design uses side-panel inspect/edit on
desktop or mobile. Use `@shadcn/dialog` / `@shadcn/alert-dialog` only when the
first implementation includes confirmation flows.

After adding components:

- Read added files under `apps/console/src/components/ui`.
- Confirm imports use `#/components/ui` and `#/lib/utils` where relevant.
- Confirm Remix Icon remains the app icon library for feature actions.
- Run focused formatting/linting for `@tocsin/console`.

## Phase 2: Shared Console Surface

Implement small reusable shell/feature helpers only when the accepted design
uses them repeatedly.

Candidate helpers:

- `PageHeader` or equivalent route-local toolbar with title, description, and
  action slot.
- `StatusFilterBar` only if filters remain consistent across Events and
  Deliveries.
- `DetailTabs` for normalized fields, route matches, deliveries, raw debug data,
  rendered payload, attempts, and errors.
- `SecretRedactionLine` for redacted config, webhook paths, env refs, and copied
  token notices.
- `TableEmptyState` using shadcn `Empty`.

Constraints:

- Do not create a frontend DI container.
- Do not put Tocsin domain components in `components/ui`.
- Keep reusable domain UI in the relevant `features/*` module unless it is truly
  shell-level.

## Phase 3: Events Tracer Bullet

Implement the accepted Events screen first.

Targets:

- `apps/console/src/features/events/ui/events-page.tsx`
- `apps/console/src/features/events/ui/events-table.tsx`
- `apps/console/src/features/events/ui/event-detail-view.tsx`
- `apps/console/src/features/operations/ui/operation-filters.tsx`
- `apps/console/src/features/operations/ui/detail-panel.tsx`
- `apps/console/src/features/configuration/ui/operational-summary.tsx`
- shared shell files only if the Stitch result requires a stable toolbar or
  detail layout helper.

Changes:

- Add a compact page toolbar above the Events table.
- Keep route search params as the source of durable filters.
- Preserve TanStack Query `operationsQueryOptions(filters)`.
- Keep `EventsTable` TanStack Table-backed through `DashboardTable` or a refined
  table helper.
- Add detail tabs/sections with normalized fields before route matches,
  deliveries, and raw debug data.
- Improve empty, loading, and error states with shadcn primitives.
- Keep raw payload/header content redacted.

Tests and checks:

```sh
pnpm --filter @tocsin/console lint
pnpm --filter @tocsin/console test
```

Browser verification:

- Start `pnpm --filter @tocsin/console dev`.
- Open the local console route in Browser MCP.
- Verify desktop and narrow viewport layout.
- Check no text overlaps, tables remain readable, and detail tabs are usable.

## Phase 4: Deliveries Follow-On

Apply the same accepted shell/table/detail language to Deliveries.

Targets:

- `features/deliveries/ui/deliveries-page.tsx`
- `features/deliveries/ui/deliveries-table.tsx`
- `features/deliveries/ui/delivery-detail-view.tsx`
- `features/operations/ui/worker-notice-panel.tsx`

Changes:

- Make `Run worker` placement match the accepted design.
- Split delivery detail into metadata, rendered payload, attempts, errors, and
  retry schedule.
- Make failed delivery retry clear and compact.
- Redact destination secrets everywhere.

## Phase 5: Configuration Pages

Work page by page after Events and Deliveries establish the console pattern.

Sources:

- Strengthen one-time token notice.
- Make copy/rotate/disable actions explicit.
- Keep provider fields compact and validated.

Routes:

- Render condition chips/rows.
- Add readable route preview.
- Keep rules simple and non-code-like.

Destinations:

- Improve preview/test result panels.
- Redact config summaries and secret fields.
- Keep test action available before routing real alerts.

Settings:

- Widen TOML import/export work area.
- Make export without secrets the default.
- Show import counts and warnings clearly.

## Phase 6: Validation And Completion Evidence

Goal completion needs evidence for both design and implementation:

- `.stitch/DESIGN.md` uploaded and linked in metadata.
- At least the accepted Stitch screen assets are downloaded under
  `.stitch/designs`.
- UI implementation matches the accepted design direction.
- shadcn preset remains `base-lyra` and base color remains `neutral`.
- Focused console lint/test pass.
- Browser verification confirms the affected routes render and remain usable.
- Sensitive data is not exposed in new client-visible UI.
