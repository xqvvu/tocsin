# Tocsin Console Stitch Prompts

These prompts are written for the Stitch project `Tocsin Console UI`
(`8189408707632940093`). Use the Tocsin design system attached to the project.
Generation prompts intentionally avoid color, font, and theme-token directives;
those live in `.stitch/DESIGN.md`.

## Global Screen Guidance

Create a desktop-first web application console for Tocsin, a self-hosted Alert Hub
used by SRE teams. The UI should be dense, calm, operational, and optimized for
repeat use. It should look like a working control console, not a marketing page,
not an incident timeline product, and not a SaaS analytics homepage.

Persistent app shell:

1. Compact product header with the title `Tocsin Console`, a short subtitle
   `SQLite-first alert hub`, refresh action, and user menu.
2. Primary navigation with Events, Deliveries, Sources, Routes, Destinations, and
   Settings.
3. Main work area that prioritizes tables, filters, detail panes, inline actions,
   empty states, and small form panels.
4. Use realistic SRE alert data and secret-safe examples. Redact tokens and
   destination secrets.

Use these shared sample names across screens:

- Sources: `signoz-prod`, `grafana-core`, `uptime-kuma-edge`, `custom-buildkite`
- Destinations: `feishu-sre-critical`, `slack-ops-alerts`, `platform-webhook`
- Routes: `Critical production alerts`, `Resolved alerts archive`, `Kuma edge
  downtime`
- Events: `Checkout API latency above SLO`, `edge-gateway-03 unreachable`,
  `Payment worker queue depth high`
- Severities: critical, warning, info
- Statuses: firing, resolved
- Delivery states: pending, running, succeeded, failed

## Screen 1: Events Operations Page

Design the Events page for inspecting inbound normalized alert history.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **App Shell:** Compact Tocsin Console header with refresh and user menu. Primary
   navigation has Events active.
2. **Page Toolbar:** Title `Events`; short line explaining this is immutable
   inbound webhook history; compact action area with refresh and reset filters.
3. **Filter Rail:** Right-side filter panel with search input, source select,
   severity select, status select, and date/cursor controls. Include an
   operational summary below with counts for sources, routes, destinations,
   events, deliveries, and worker state.
4. **Events Table:** Dense table with columns for severity, status, source,
   title/message, fingerprint, route matches, occurred, received, and row
   actions. Include inline badges and truncated monospace IDs. Show pagination
   controls for latest/older.
5. **Event Detail Panel:** Below or beside the table, show selected event
   details for `Checkout API latency above SLO`. Use tabs or segmented sections:
   normalized fields, route matches, deliveries, and raw debug data. Raw debug
   data must appear redacted and visually secondary.
6. **Failure/Empty States:** Include a compact error alert area and a table empty
   state pattern, but keep sample data visible in this design.

## Screen 2: Deliveries Operations Page

Design the Deliveries page for outbound delivery jobs, retry, and worker
inspection.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **App Shell:** Same persistent shell with Deliveries active.
2. **Page Toolbar:** Title `Deliveries`; compact explanation of asynchronous
   outbound jobs; primary inline action `Run worker` with a small icon.
3. **Filter Rail:** Right-side filters for destination, delivery state, source,
   severity, status, and search text. Include a worker notice panel showing a
   recent manual run with claimed, succeeded, failed, and skipped counts.
4. **Deliveries Table:** Dense table with columns for state, destination, event,
   attempts, next attempt, last error, updated, and actions. Include a failed row
   with a clear retry action and a succeeded row with quieter action affordance.
5. **Delivery Detail Panel:** Show selected failed delivery to
   `slack-ops-alerts`. Include destination metadata, event reference, rendered
   payload preview, attempt history table, last error, and retry schedule.
6. **Data Safety:** Destination webhook URL and signing secret must be redacted.
   Rendered payload may show message fields but no secrets.

## Screen 3: Sources Configuration Page

Design the Sources page for configuring inbound webhook sources.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **App Shell:** Same persistent shell with Sources active.
2. **Page Toolbar:** Title `Sources`; explain each upstream tool gets its own
   webhook URL and token.
3. **Sources Table:** Dense table with provider, name, enabled state, webhook
   path, last received, token status, and row actions. Actions include copy
   webhook path, edit, disable/enable, and rotate token.
4. **Create Source Panel:** Right-side form with provider select, source name,
   enabled checkbox/toggle, optional provider secret fields, and create button.
   Use labeled fields and validation states.
5. **Token Notice:** Show a one-time token notice after creation or rotation.
   The token appears in a monospace line with copy button and clear warning that
   it will not be shown again.
6. **Edit State:** Include one row or panel in edit mode with save/cancel
   actions. Secret fields should show redacted placeholders.

## Screen 4: Routes Configuration Page

Design the Routes page for inspectable alert routing rules.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **App Shell:** Same persistent shell with Routes active.
2. **Page Toolbar:** Title `Routes`; explain routes match normalized alert fields
   and send to one or more destinations.
3. **Routes Table:** Dense table with enabled state, route name, readable match
   summary, destination fan-out, last matched, and actions. Show condition chips
   for source, severity, status, label, title contains, and message contains.
4. **Route Builder Panel:** Right-side structured form for creating a route.
   Include route name, enabled control, source multi-select, severity select,
   status select, label condition rows, title/message contains fields, and
   destination multi-select.
5. **Rule Preview:** Include a compact human-readable preview such as
   `source is signoz-prod AND severity is critical -> feishu-sre-critical,
   slack-ops-alerts`.
6. **Edit State:** Show a selected route in edit mode with save/cancel and
   disabled state controls.

## Screen 5: Destinations Configuration Page

Design the Destinations page for outbound notification integrations.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **App Shell:** Same persistent shell with Destinations active.
2. **Page Toolbar:** Title `Destinations`; explain destinations keep secrets
   server-side and can be previewed/tested before routing real alerts.
3. **Destinations Table:** Dense table with destination type, name, enabled
   state, redacted config summary, last test status, used by routes, and row
   actions. Actions include preview, test, edit, disable/enable.
4. **Create Destination Panel:** Right-side form with type select for Feishu,
   Slack, Email, and Generic Webhook. Include provider-specific fields with
   redacted secret inputs, enabled control, and create button.
5. **Preview/Test Notices:** Include compact panels for rendered message preview
   and destination test result. Test result should show status, timing, and a
   redacted response/error area.
6. **Data Safety:** Webhook URLs, tokens, signing secrets, SMTP passwords, and
   access tokens must never appear in plaintext.

## Screen 6: Settings And TOML Portability Page

Design the Settings page for runtime settings and TOML import/export.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **App Shell:** Same persistent shell with Settings active.
2. **Page Toolbar:** Title `Settings`; explain this page controls retention,
   worker behavior, and portable TOML configuration.
3. **Operational Summary:** Main area summary showing configured sources,
   enabled routes, destinations, raw payload retention, pending deliveries, and
   current SQLite schema version.
4. **App Settings Form:** Right-side or upper panel with raw payload retention
   days, maximum retry count, worker batch size, and enabled controls. Use
   compact numeric fields with validation messaging.
5. **TOML Portability Panel:** Large textarea/code editor area for exported TOML,
   with actions export without secrets, import TOML, and clear. Include helper
   text that secrets are omitted by default and environment variable references
   are supported.
6. **Import Result Notice:** Show a compact result panel with counts for created,
   updated, skipped, and warnings.

## First Generation Recommendation

Generate Screen 1 first. If the app shell, density, and detail-panel treatment
are correct, use targeted edits or variants for the remaining pages rather than
regenerating from scratch.
