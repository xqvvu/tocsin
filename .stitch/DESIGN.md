# Tocsin Console Design System

## 1. Product Frame

Tocsin is a self-hosted Alert Hub for SRE and operations teams. The UI is not a
marketing site, incident-management suite, or SaaS analytics dashboard. It is a
compact control console for proving what was received, how it normalized, why it
routed, what was delivered, and what needs retry.

The interface should feel like calm self-hosted operations software: precise,
repeatable, dense, and trustworthy. Prefer tables, filters, detail panes,
drawers, explicit disabled states, redacted secret displays, and reviewable
actions over decorative overview cards.

## 2. Source Style

Match the current shadcn preset and local console configuration:

- shadcn style: base-lyra
- Tailwind base color: neutral
- Icon language: Remix Icon line icons
- Theme mode: light-first, with dark mode compatible contrast
- Product tone: compact, utilitarian, operational
- Component geometry: slightly softened square corners, not pill-heavy
- Surfaces: semantic shadcn tokens such as background, card, muted, border,
  input, primary, destructive, sidebar

Do not invent a separate visual brand. Do not use large hero areas, marketing
illustrations, decorative gradients, glossy SaaS dashboard widgets, rounded
floating cards, or one-off chart systems.

## 3. Color Roles

Use these role values as the design-system source of truth for Stitch. In the
implementation, map them back to semantic shadcn tokens instead of hard-coding
color values.

- Background: White (#ffffff)
- Foreground: Near Black (#0a0a0a)
- Card: White (#ffffff)
- Muted Surface: Neutral 50 (#f5f5f5)
- Secondary Surface: Zinc 100 (#f4f4f5)
- Border/Input: Neutral 200 (#e5e5e5)
- Muted Text: Neutral 500 (#737373)
- Primary Action: Burnt Orange (#bb4d00)
- Primary Foreground: Warm Ivory (#fffbeb)
- Sidebar Surface: Neutral 50 (#fafafa)
- Sidebar Primary: Orange 600 (#e17100)
- Destructive: Alert Red (#e7000b)
- Focus Ring: Neutral 400 (#a1a1a1)

Status roles:

- Critical severity: use destructive treatment.
- Warning severity: use primary/action treatment.
- Info/low severity: use secondary or muted treatment.
- Succeeded delivery: use a low-emphasis positive badge, never an oversized
  celebration treatment.
- Pending/running delivery: use neutral or outline treatment with clear labels.
- Disabled sources, routes, and destinations: muted text, explicit disabled
  badge, and disabled action affordance.

## 4. Typography

- Body font: Noto Sans Variable, system sans fallback
- Heading font: Nunito Sans Variable, system sans fallback
- Default console text: compact 12-14px scale
- Page title: 18-22px, semibold, restrained
- Panel title: 13-14px, semibold
- Table headers: 11-12px, medium, muted
- Table cells: 12-13px, truncate long IDs and payload fragments
- Code and token values: monospace treatment inside compact code chips or code
  blocks

Do not use hero-scale typography inside the app shell. Preserve high information
density without cramped line-height.

## 5. Layout Rules

- Use a stable app shell with a top header or compact sidebar navigation.
- Keep the first viewport immediately useful: filters, primary table, and a
  detail/summary area should be visible without scrolling on desktop.
- Use a max-width work area where helpful, but allow dense tables to span the
  available width.
- Prefer a two-column operational layout on desktop: primary table/list on the
  left, forms/summary on the right.
- For Events/Deliveries filters: use a horizontal toolbar pattern — primary
  search input, Filters popover with dimension selects, removable active filter
  chips, and a filter count badge. Do not stack six labeled selects in the right
  rail as the primary filter surface.
- On narrow screens, stack the right rail under the main content and keep actions
  reachable.
- Use 1px semantic borders and flat surfaces. Use subtle background contrast for
  grouping.
- Cards are only for concrete panels, forms, summaries, detail areas, or repeated
  items. Do not nest cards inside cards.
- Keep panel corners at or below 8px visually.

## 6. Components

Use shadcn primitives as the mental component set:

- Button with small size and variants for primary, outline, ghost, destructive
- Badge for state, severity, provider, enabled/disabled, route match, retry state
- Table for Events, Deliveries, Sources, Routes, Destinations
- Field, FieldGroup, Input, Select, Textarea, Checkbox, Switch-like
  enabled controls for forms
- Separator for structural division
- Alert for warnings, import notices, token-once notices, and delivery errors
- Skeleton for loading table rows and detail panes
- Empty for no data states
- Tabs for detail panes when normalized fields, raw debug data, matches, attempts,
  rendered payload, and errors need separation
- Sheet or Drawer for inspect/edit flows when there is not enough horizontal
  room
- Dialog or AlertDialog for destructive confirmations and token rotation
- DropdownMenu for row actions
- Tooltip for icon-only actions and sensitive-data explanations

## 7. Navigation

Primary sections:

- Events
- Deliveries
- Sources
- Routes
- Destinations
- Settings

Navigation should support rapid switching between operational history and
configuration. Active route states should be clear but not loud. Use icon-label
pairs where space allows, with text always available for clarity.

## 8. Domain Content Patterns

Events:

- Show normalized alert title, severity, status, source, provider, fingerprint,
  occurred time, received time, and route match summary.
- Raw payload belongs in detail/debug views and must appear redacted.
- Event detail should show normalized fields first, then route matches,
  deliveries, and raw debug data.

Deliveries:

- Show delivery state, destination, event title, attempts, next attempt time,
  last error, and updated time.
- Failed deliveries must expose retry action, attempt history, and error details.
- Running/pending deliveries should be visibly distinct without using animation.

Sources:

- Show provider, enabled state, webhook path, token rotation, last received time,
  and safe copy controls.
- Source tokens are one-time visible only after create/rotate.
- Disable and rotate token actions must look explicit and reviewable.

Routes:

- Show rule name, enabled state, match conditions, destination fan-out, and
  readable rule summary.
- Route rules should look inspectable, not like code expressions.
- Use structured condition rows or chips for source, severity, status, label,
  title contains, and message contains.

Destinations:

- Show destination type, enabled state, redacted config summary, preview action,
  test action, and last test result.
- Secret values must appear as redacted labels or environment-variable
  references.
- Preview/test results should be reviewable in a detail panel or notice.

Settings:

- Show retention settings, TOML/JSON import/export, config portability, and
  operational summary.
- TOML/JSON export should default to secrets omitted.
- TOML and JSON editors should share the same CodeMirror geometry, theme,
  folding treatment, editable behavior, and reviewable import confirmation.
- Import results should be summarized with counts and warnings.

## 9. Interaction Rules

- Every state-changing action should have a clear disabled/loading state.
- Use compact inline actions for inspect/copy/retry/test/preview/edit.
- Use confirmation for destructive or secret-touching actions.
- Use detail panes or sheets for inspecting payloads and attempts; do not
  navigate away from the table unnecessarily.
- Keep filters visible and URL-shaped: source, severity, status, destination,
  delivery state, search text, cursor pagination.
- Avoid visual noise: no ornamental illustrations, decorative charts, bokeh,
  gradient blobs, or landing-page hero sections.

## 10. Accessibility And Data Safety

- Use clear labels for all filters and form controls.
- Icon-only buttons require tooltips or accessible names.
- Tables need recognizable headers and stable row actions.
- Detail panes should have section titles and empty states.
- Sensitive data must always be redacted in ordinary UI.
- Use monospace display for webhook paths, fingerprints, IDs, env refs, and TOML.
