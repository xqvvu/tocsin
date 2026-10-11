# Stitch To Implementation Map

This file maps the Stitch design intent to the current Tocsin console codebase.
Keep implementation route-first and feature-module oriented.

## Project Facts

- Stitch project: `Tocsin Console UI`
- Stitch project ID: `8189408707632940093`
- shadcn preset/style: `base-lyra`
- base color: `neutral`
- icon library: `remixicon`
- Tailwind CSS entry: `apps/console/src/styles.css`
- UI primitive alias: `#/components/ui`
- utility alias: `#/lib/utils`

## Current Route Targets

- `/events` -> `apps/console/src/routes/_dashboard.events.tsx`
- `/deliveries` -> `apps/console/src/routes/_dashboard.deliveries.tsx`
- `/sources` -> `apps/console/src/routes/_dashboard.sources.tsx`
- `/routes` -> `apps/console/src/routes/_dashboard.routes.tsx`
- `/destinations` -> `apps/console/src/routes/_dashboard.destinations.tsx`
- `/settings` -> `apps/console/src/routes/_dashboard.settings.tsx`

Route files should stay thin. UI implementation belongs in these feature
modules:

- `features/events/ui`
- `features/deliveries/ui`
- `features/sources/ui`
- `features/routes/ui`
- `features/destinations/ui`
- `features/configuration/ui`
- shared shell in `shell/*`

## Installed shadcn Primitives

Currently present:

- `badge`
- `button`
- `card`
- `checkbox`
- `field`
- `input`
- `label`
- `native-select`
- `separator`
- `table`
- `textarea`

Likely additions after Stitch review:

- `sheet` for inspect/edit on constrained screens
- `tabs` for event/delivery detail sections
- `empty` for table empty states
- `alert` for notices and errors if not already available
- `dropdown-menu` for dense row actions
- `tooltip` for icon-only actions
- `skeleton` for loading table/detail states
- `dialog` or `alert-dialog` for token rotation and destructive confirms

Suggested shadcn add command for first likely batch:

```sh
npx shadcn@latest add @shadcn/sheet @shadcn/tabs @shadcn/empty
```

Confirmed registry candidates from shadcn MCP:

- `@shadcn/sheet`
- `@shadcn/tabs`
- `@shadcn/empty`
- `@shadcn/alert`
- `@shadcn/dialog`
- `@shadcn/alert-dialog`
- `@shadcn/dropdown-menu`
- `@shadcn/tooltip`
- `@shadcn/skeleton`

Broader likely install command after reviewing the first Stitch screen:

```sh
npx shadcn@latest add @shadcn/sheet @shadcn/tabs @shadcn/empty @shadcn/alert @shadcn/dropdown-menu @shadcn/tooltip @shadcn/skeleton
```

Run shadcn commands from `apps/console`.

## Implementation Rules From Design

- Preserve shadcn semantic tokens; do not hard-code Stitch hex values into app
  components.
- Use Remix Icon components for action icons.
- Keep cards flat and compact; avoid nested cards.
- Tables remain TanStack Table driven.
- Forms remain TanStack Form driven where non-trivial.
- Server state remains TanStack Query driven through feature query options and
  server functions.
- Route search params own durable filters and pagination cursors.
- Sensitive data remains redacted in all client-visible DTOs and UI.

## Screen To Component Mapping

### Events

- Page shell: `EventsPage`
- Table: `EventsTable`
- Filters: `OperationFilters`
- Detail: `DetailPanel` + `EventDetailView`
- Summary: `OperationalSummary`

Design refinements to implement:

- Add page toolbar/title above table.
- Upgrade detail panel to tabs/sections for normalized fields, route matches,
  deliveries, and raw debug data.
- Improve empty and loading states.
- Make row actions compact and icon-assisted.

### Deliveries

- Page shell: `DeliveriesPage`
- Table: `DeliveriesTable`
- Detail: `DetailPanel` + `DeliveryDetailView`
- Worker notice: `WorkerNoticePanel`
- Filters: `OperationFilters`

Design refinements to implement:

- Give `Run worker` an obvious toolbar or right-rail placement.
- Make failed delivery retry prominent but not oversized.
- Split detail into destination metadata, rendered payload, attempts, and error.
- Redact destination secrets everywhere.

### Sources

- Page shell: `SourcesPage`
- Table/form section: `SourcesSection`
- Create/edit form: `CreateSourceForm`
- Token notice: `SourceTokenNoticePanel`
- Webhook display: `SourceWebhookCell`

Design refinements to implement:

- Strengthen one-time token notice.
- Make copy/rotate/disable actions explicit.
- Show provider and webhook path in compact table cells.
- Consider edit-in-sheet if the table becomes crowded.

### Routes

- Page shell: `RoutesPage`
- Table/form section: `RoutesSection`
- Create/edit form: `CreateRouteForm`
- Rule summary: `route-rule-summary.ts`

Design refinements to implement:

- Render route conditions as readable chips/rows.
- Add live human-readable rule preview.
- Make destination fan-out easy to scan.
- Keep route rules inspectable and non-code-like.

### Destinations

- Page shell: `DestinationsPage`
- Table/form section: `DestinationsSection`
- Create/edit form: `CreateDestinationForm`
- Notices: `DestinationPreviewNoticePanel`, `DestinationTestNoticePanel`

Design refinements to implement:

- Put preview/test results into compact review panels.
- Redact secrets in config summaries and notices.
- Make provider-specific form fields clearer.
- Keep test action available before enabling routes.

### Settings

- Page shell: `SettingsPage`
- Settings form: `AppSettingsForm`
- TOML panel: `PortableConfigForm`
- Import notice: `ImportNoticePanel`
- Summary: `OperationalSummary`

Design refinements to implement:

- Give TOML import/export a wider code-oriented panel.
- Make `export without secrets` the default action.
- Show import counts and warnings in a compact alert/panel.
- Keep retention and worker settings tightly grouped.

## Stitch Asset Workflow

After generating a screen in Stitch:

1. Capture `output_components` text description and suggestions.
2. Download screenshot and HTML assets into `.stitch/designs`.
3. Update `.stitch/metadata.json` with screen IDs, asset filenames, and notes.
4. Review against this implementation map before coding.

## Ready-To-Run Prompt File

Use `.stitch/prompts/ready-to-run.md` for direct Stitch generation after the
design system has been uploaded. Start with "Events Operations Page" and only
move to the other pages after the shell, density, and detail treatment pass
`.stitch/prompts/design-qa.md`.
