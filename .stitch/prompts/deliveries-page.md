# Tocsin Deliveries Operations Page

Design the Deliveries page for Tocsin, a self-hosted Alert Hub console used by
SREs to inspect outbound notification jobs, retry failed sends, and understand
attempt history. This is a compact operational console screen, not a marketing
dashboard and not an incident management workflow.

**PLATFORM:** Web, desktop-first, responsive down to narrow dashboard widths.

**PAGE STRUCTURE:**

1. **App Shell:** Preserve the existing Tocsin console shell pattern from the
   Events screen: compact top bar, section navigation, active Deliveries item,
   dense work area.

2. **Page Toolbar:** A compact bordered toolbar above the table with:
   - Title "Deliveries"
   - Short operational description about outbound notification jobs, retries,
     rendered payloads, and attempts
   - Count label such as "9 loaded"
   - Primary operational action "Run worker"
   - Secondary action "Reset filters"
   Avoid any action that creates a delivery manually.

3. **Primary Delivery Table:** A dense table as the main left-side surface.
   Columns should support fast delivery triage:
   - Delivery target: destination name, destination kind, route name if present
   - Related event: compact alert title or event id/fingerprint fragment
   - State badge: pending, running, succeeded, failed
   - Attempts: current attempts and max attempts
   - Retry schedule: next attempt time or dash
   - Last error: truncated error summary for failed deliveries
   - Updated time
   - Row actions: inspect, retry only when failed
   Make failed rows visibly reviewable without making the whole page alarming.

4. **Right Filter Rail:** A persistent right rail matching the Events screen.
   Include filters for source, severity, alert status, destination, delivery
   state, and text search. Include compact operational counters for pending,
   running, failed, retrying, or worker result if a worker run notice exists.

5. **Worker Notice:** Show the result of a recent "Run worker" action as a
   compact alert or summary panel. It should include claimed, succeeded, failed,
   and retrying counts. This is operational feedback, not a celebratory banner.

6. **Delivery Detail Panel:** Below or beside the table, show an inspect panel
   that uses tabs:
   - Summary: destination, kind, source, route, state, attempts, next attempt,
     last error, updated time
   - Rendered payload: redacted payload preview in a code block
   - Attempts: attempt history table with attempt number, state, HTTP status,
     started, finished, and error/response summary
   - Metadata: destination metadata and redacted config-derived fields
   The detail panel should make failed deliveries actionable and audit-friendly.

7. **Empty and Loading States:** Include compact empty states for no deliveries
   and no attempts. Loading skeletons should preserve table dimensions if shown.

**PRODUCT BOUNDARIES:**

- Do not add on-call schedules, escalation policies, incident timelines,
  silence/suppression controls, manual delivery creation, Slack-style chat
  concepts, or SaaS tenant/team management.
- Do not expose raw destination secrets, webhook URLs with secrets, tokens,
  signing secrets, or unredacted payload data.
- Keep retry, run worker, inspect, filter, and history as the core workflow.

**IMPLEMENTATION MAPPING NOTES:**

- Map table and detail surfaces to existing React feature modules:
  `DeliveriesPage`, `DeliveriesTable`, `DeliveryDetailView`,
  `WorkerNoticePanel`, `OperationFilters`, and `DetailPanel`.
- Use existing shadcn primitives such as Button, Badge, Table, Alert, Tabs,
  Empty, Skeleton, Input, Field, and NativeSelect.
- Keep durable filter state URL-backed and server state TanStack Query-backed.
