# Tocsin Stitch Design QA Checklist

Use this checklist after each Stitch generation and before implementing UI in
`apps/console`.

## Product Fit

- The screen looks like a self-hosted operations console, not a marketing page.
- The first viewport is immediately useful for SRE work.
- The page language uses Tocsin domain terms: Sources, Routes, Destinations,
  Events, Deliveries, Retry, History, TOML, JSON.
- There are no SaaS tenancy, billing, org invitation, incident lifecycle,
  escalation policy, or on-call schedule concepts.

## Visual Fit

- The design preserves shadcn `base-lyra` neutral style.
- The design is compact, flat, and table-first.
- Panels use restrained borders and small radius.
- Typography is small enough for repeated operations work.
- There are no oversized hero sections, decorative dashboard cards, gradients,
  blobs, bokeh, illustrations, or novelty animations.

## Component Fit

- Tables are the primary structure for Events, Deliveries, Sources, Routes, and
  Destinations.
- Filters are visible and map to durable URL state.
- Forms use labeled fields and validation states.
- Detail areas can be implemented with Tabs, Sheet, or compact sections.
- Row actions can be implemented with Button, DropdownMenu, Dialog, or
  AlertDialog as appropriate.
- Empty, loading, error, and disabled states are visible.

## Security Fit

- Source tokens are hidden except for intentional one-time token notices.
- Destination secrets and webhook URLs are redacted.
- Raw headers and payloads are redacted in ordinary UI.
- TOML/JSON export defaults to secrets omitted.
- Secret-touching actions are explicit and reviewable.

## Implementation Fit

- Route files can stay thin and render feature pages.
- Feature modules can own the UI without importing server-only modules.
- TanStack Query owns server state.
- TanStack Router search params own filters and cursor state.
- TanStack Form can own non-trivial forms.
- TanStack Table can own dense table models.
- Required new shadcn primitives are identified before coding.

## First Screen Acceptance

For the Events screen, accept the Stitch result only if:

- Events active nav is clear.
- Filter rail, events table, and selected detail are all visible on desktop.
- Event detail shows normalized fields before raw debug data.
- Raw debug data is redacted.
- Tables remain dense and readable.
- The composition can map onto the existing `EventsPage`, `EventsTable`,
  `OperationFilters`, `DetailPanel`, `EventDetailView`, and
  `OperationalSummary` components.
