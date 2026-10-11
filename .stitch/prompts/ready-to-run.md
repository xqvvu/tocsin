# Ready-To-Run Stitch Prompts

Use these prompts after the Tocsin design system has been uploaded to the Stitch
project. Do not paste color, font, or theme tokens into generation prompts.

## 1. Events Operations Page

Design the Events page for Tocsin, a self-hosted Alert Hub used by SRE teams to
inspect immutable inbound webhook history and normalized alert fields. The page
must feel like a compact operations console for repeated triage work.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **Persistent App Shell:** Compact header with `Tocsin Console`, subtitle
   `SQLite-first alert hub`, refresh action, user menu, and primary navigation
   with Events active. Navigation items are Events, Deliveries, Sources, Routes,
   Destinations, and Settings.
2. **Page Toolbar:** A restrained toolbar above the work area with title
   `Events`, supporting text `Immutable inbound webhook history`, a small
   refresh action, and a reset filters action. Keep it compact; no hero area.
3. **Primary Work Area:** Two-column operational layout. The left column owns the
   Events table and selected detail panel. The right rail owns filters and a
   small operational summary.
4. **Filter Rail:** Search input, source select, severity select, status select,
   destination select, delivery state select, latest/older cursor controls, and
   a compact summary for enabled sources, destinations, routes, pending
   deliveries, and worker state.
5. **Events Table:** Dense table with rows for `Checkout API latency above SLO`,
   `edge-gateway-03 unreachable`, and `Payment worker queue depth high`.
   Columns: severity, status, source, title/message, fingerprint, route matches,
   deliveries, occurred, received, and actions. Use inline badges, truncated
   monospace fingerprints, and compact inspect action.
6. **Selected Event Detail:** Detail panel for `Checkout API latency above SLO`
   with tabs or segmented sections for normalized fields, route matches,
   deliveries, and raw debug data. Normalized fields appear first. Raw debug data
   is redacted and visually secondary. Deliveries show state counts and links to
   destination names.
7. **Operational States:** Include a compact error alert area and an empty table
   state pattern, while keeping sample data visible in the main composition.

**CONTENT CONSTRAINTS:**

- Use realistic SRE alert vocabulary.
- Redact tokens, authorization headers, cookies, signing secrets, and webhook URL
  secrets.
- Do not include incident lifecycle, on-call scheduling, billing, tenant, or SaaS
  organization concepts.

## 2. Deliveries Operations Page

Design the Deliveries page for Tocsin, focused on outbound delivery jobs, retry
behavior, worker inspection, and failure diagnosis.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **Persistent App Shell:** Same shell as Events, with Deliveries active.
2. **Page Toolbar:** Title `Deliveries`, supporting text `Asynchronous outbound
   notification jobs`, and primary action `Run worker` with a compact icon.
3. **Primary Work Area:** Dense deliveries table on the left; filters, worker
   notice, and operational controls in the right rail.
4. **Filter Rail:** Destination select, delivery state select, source select,
   severity select, status select, search input, and pagination controls.
5. **Worker Notice:** Compact notice showing a recent manual run: claimed 10,
   succeeded 8, failed 1, skipped 1. It should be easy to dismiss or ignore.
6. **Deliveries Table:** Rows for pending, running, succeeded, and failed jobs.
   Columns: state, destination, event title, attempts, next attempt, last error,
   updated time, and actions. Failed row has clear retry and inspect actions.
7. **Selected Delivery Detail:** Detail panel for a failed delivery to
   `slack-ops-alerts`. Include destination metadata, event reference, rendered
   payload preview, attempt history table, last error, retry schedule, and
   manually retry action.

**CONTENT CONSTRAINTS:**

- Destination webhook URL and signing secret must be redacted.
- Retry behavior should look bounded and inspectable.
- Do not show decorative charts or large KPI cards.

## 3. Sources Configuration Page

Design the Sources page for configuring inbound webhook sources. Each upstream
monitoring tool gets its own webhook path and token.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **Persistent App Shell:** Same shell, with Sources active.
2. **Page Toolbar:** Title `Sources`, supporting text `Upstream tools send
   alerts to source-specific webhook URLs`.
3. **Sources Table:** Dense table with provider, source name, enabled state,
   webhook path, last received time, token status, and actions. Include
   `signoz-prod`, `grafana-core`, `uptime-kuma-edge`, and `custom-buildkite`.
4. **Row Actions:** Copy webhook path, edit, disable/enable, rotate token. Token
   rotation should feel explicit and reviewable.
5. **Create Source Panel:** Right-side form with provider select, source name,
   enabled control, optional provider secret fields, and create button. Show
   validation affordances.
6. **One-Time Token Notice:** Notice after create/rotate for `signoz-prod`,
   showing a monospace token line with copy button and warning that it will not
   be shown again.
7. **Edit Treatment:** Include one source in edit mode with save/cancel actions.
   Secret fields show redacted placeholders.

**CONTENT CONSTRAINTS:**

- Do not show token hashes or full source tokens except the intentional
  one-time token notice.
- Provider options should include SigNoz, Grafana, Uptime Kuma, and Generic
  Webhook.

## 4. Routes Configuration Page

Design the Routes page for simple, inspectable alert routing rules. Routes match
normalized alert fields and fan out to one or more destinations.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **Persistent App Shell:** Same shell, with Routes active.
2. **Page Toolbar:** Title `Routes`, supporting text `Match normalized alert
   fields and deliver to selected destinations`.
3. **Routes Table:** Dense table with enabled state, route name, readable match
   summary, destination fan-out, last matched time, and actions. Include routes
   `Critical production alerts`, `Resolved alerts archive`, and `Kuma edge
   downtime`.
4. **Condition Display:** Show source, severity, status, label, title contains,
   and message contains as structured chips or compact condition rows. Make
   rules readable without code expressions.
5. **Route Builder Panel:** Right-side form with route name, enabled control,
   source multi-select, severity select, status select, label condition rows,
   title/message contains inputs, destination multi-select, and create button.
6. **Rule Preview:** Human-readable preview:
   `source is signoz-prod AND severity is critical -> feishu-sre-critical,
   slack-ops-alerts`.
7. **Edit Treatment:** Show selected route edit state with save/cancel and
   disabled-state controls.

**CONTENT CONSTRAINTS:**

- Do not use arbitrary JavaScript, workflow graph, automation builder, schedules,
  silences, or escalation policy concepts.
- Routes should look deliberately simple and auditable.

## 5. Destinations Configuration Page

Design the Destinations page for outbound notification integrations. Operators
can preview/test destinations before routing real alerts.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **Persistent App Shell:** Same shell, with Destinations active.
2. **Page Toolbar:** Title `Destinations`, supporting text `Outbound senders keep
   secrets server-side`.
3. **Destinations Table:** Dense table with type, name, enabled state, redacted
   config summary, last test status, used-by routes count, and row actions.
   Include `feishu-sre-critical`, `slack-ops-alerts`, and `platform-webhook`.
4. **Row Actions:** Preview, test, edit, disable/enable.
5. **Create Destination Panel:** Right-side form with type select for Feishu,
   Slack, Email, and Generic Webhook. Include provider-specific fields with
   redacted secret inputs, enabled control, and create button.
6. **Preview Notice:** Compact rendered message preview using normalized alert
   fields from `Checkout API latency above SLO`.
7. **Test Result Notice:** Compact destination test result with status, timing,
   response summary, and redacted error area.

**CONTENT CONSTRAINTS:**

- Never show webhook URLs, signing secrets, SMTP passwords, access tokens, or
  embedded secret URLs in plaintext.
- Keep preview/test actions prominent but compact.

## 6. Settings And TOML Portability Page

Design the Settings page for runtime settings, raw payload retention, worker
behavior, and TOML import/export.

**PLATFORM:** Web, desktop-first

**PAGE STRUCTURE:**

1. **Persistent App Shell:** Same shell, with Settings active.
2. **Page Toolbar:** Title `Settings`, supporting text `Runtime controls and
   portable TOML configuration`.
3. **Operational Summary:** Main summary showing configured sources, enabled
   routes, destinations, raw payload retention, pending deliveries, and current
   SQLite schema version.
4. **App Settings Form:** Compact form for raw payload retention days, maximum
   retry count, worker batch size, and worker enabled controls. Include
   validation messaging.
5. **TOML Portability Panel:** Large code-oriented textarea for exported TOML,
   with actions export without secrets, import TOML, and clear. Explain that
   secrets are omitted by default and environment variable references are
   supported.
6. **Import Result Notice:** Compact result panel with created, updated,
   skipped, and warning counts.

**CONTENT CONSTRAINTS:**

- TOML, not YAML.
- Export without secrets should be the default.
- Keep settings operational, not billing/account/team-management oriented.
