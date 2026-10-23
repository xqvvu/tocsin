# PRD: Self-Hosted Alert Hub MVP

Labels: `mvp-baseline-complete`, `post-mvp-planning`

## Status

As of 2026-06-26, the MVP product baseline is considered implemented in the
repository. The core path is present end to end: dashboard setup/login, Source
configuration, authenticated webhook intake, provider parsing, immutable Events,
route matching, asynchronous Delivery jobs, destination preview/send, retry
history, operational Events/Deliveries views, Settings, TOML portability,
SQLite migrations, health/readiness endpoints, and Docker runtime shape.

This PRD now acts as the historical source of truth for the MVP scope and the
architecture constraints that should continue to guide future work. New product
work should be discussed in a post-MVP PRD before being split into issues.

The MVP baseline being complete does not mean every release-hardening item is
finished. Remaining release and production-readiness work is tracked in
`docs/release/mvp-rc-checklist.md`: provider payload fixtures, the
backup/restore drill, and wiring the Docker smoke gate into CI. E2E and the
release documentation are already in place.

## Problem Statement

SRE and operations teams often run multiple monitoring and uptime tools, such
as SigNoz, Grafana, Uptime Kuma, Alertmanager, and custom webhook senders. Each
tool needs to be configured separately for each notification channel, such as
Feishu, Slack, email, or a generic webhook. This creates duplicated setup,
scattered secrets, inconsistent routing rules, and poor visibility into whether
a notification was received, routed, retried, or delivered.

The user wants Tocsin to be an open-source, self-hosted Alert Hub: a single
private deployment that can receive alerts from many upstream systems,
normalize them, route them using simple rules, and deliver them reliably to one
or more destinations. The product should feel like self-hosted operations
software in the spirit of Uptime Kuma, not like a SaaS platform or a
general-purpose automation engine.

## Solution

Build Tocsin as a SQLite-first, single-image, self-hosted Alert Hub for SRE
workflows.

Users create Sources for upstream systems, copy a source-specific webhook URL
into tools like SigNoz, Grafana, Uptime Kuma, or Alertmanager, and then
configure Routes that match normalized alert fields and send matching alerts to
Destinations such as Feishu, Slack, email, or generic webhooks.

The system stores each inbound webhook as an immutable Event, preserves raw
payloads for debugging and replay, normalizes provider-specific payloads into
shared alert fields, creates asynchronous Delivery jobs, and records delivery
history, retries, failures, and errors. Day-to-day setup happens in the UI,
while TOML is the Tocsin-owned config-as-code and import/export format. YAML
support is explicitly out of scope for Tocsin-owned configuration.

The MVP should keep deployment simple: one app process, one Docker image, one
mounted data volume, and SQLite as the default persistence and delivery queue
backing store. It should not require Redis, Postgres, Kafka, Temporal, a
separate worker service, or SaaS-style tenancy.

## User Stories

1. As an SRE, I want to create a Source for SigNoz, so that SigNoz can send alerts to one Tocsin webhook URL.
2. As an SRE, I want to create a Source for Grafana, so that Grafana alert webhooks can be routed from Tocsin.
3. As an SRE, I want to create a Source for Uptime Kuma, so that uptime notifications can flow through the same hub as other alerts.
4. As an SRE, I want to create a generic webhook Source, so that custom systems can send alert-like events without first-class provider support.
5. As an SRE, I want each Source to have its own webhook URL and token, so that I can rotate, disable, and audit one upstream independently.
6. As an SRE, I want to disable a Source, so that a noisy or retired upstream system stops creating deliveries without deleting its history.
7. As an SRE, I want inbound webhook requests to be accepted quickly, so that upstream monitoring tools are not blocked by slow destination services.
8. As an SRE, I want Tocsin to preserve every inbound webhook as an Event, so that I can prove what Tocsin received.
9. As an SRE, I want Tocsin to show normalized alert fields, so that different providers can be inspected in a common way.
10. As an SRE, I want raw payloads available in debug views, so that I can investigate parser issues and unexpected provider behavior.
11. As an SRE, I want common sensitive fields redacted, so that secrets are not exposed in logs or ordinary UI views.
12. As an SRE, I want raw payload retention to be configurable, so that SQLite storage stays bounded.
13. As an SRE, I want provider parsers for common tools, so that I do not need to hand-map every payload shape.
14. As an open-source contributor, I want provider parsers to live behind a clear adapter interface, so that I can add support for a monitoring tool without understanding the whole app.
15. As an open-source contributor, I want provider fixtures and tests, so that changes to one parser do not break normalized alert behavior.
16. As an SRE, I want normalized alerts to include title, message, severity, status, labels, fingerprint, and occurred time, so that routes and templates can work across providers.
17. As an SRE, I want alert identity to be represented separately from request idempotency, so that repeat firing alerts are not accidentally suppressed.
18. As an SRE, I want exact duplicate webhook retries to avoid duplicate deliveries, so that upstream network retries do not create alert noise.
19. As an SRE, I want repeated firing notifications to still be delivered by default, so that upstream repeat-alert semantics are preserved.
20. As an SRE, I want to create a Feishu Destination, so that critical alerts can be sent to a team robot.
21. As an SRE, I want to create a Slack Destination, so that alerts can be sent to an operations channel.
22. As an SRE, I want to create a generic webhook Destination, so that I can relay alerts to internal systems.
23. As an SRE, I want to disable a Destination, so that I can stop outbound notifications without deleting config or history.
24. As an SRE, I want to test a Destination from the UI, so that I can verify credentials and message formatting before routing real alerts.
25. As an SRE, I want destination signing secrets and passwords to stay server-side, while operational endpoints and recipients remain visible in the authenticated dashboard, so that I can verify private-deploy configuration without leaking credentials into browser state or logs.
26. As an open-source contributor, I want destination integrations to use a shared sender interface, so that Feishu, Slack, email, and webhook senders can be added consistently.
27. As an SRE, I want to create Routes that match Sources, so that different upstream systems can notify different teams.
28. As an SRE, I want to create Routes that match severity, so that critical alerts can go to urgent channels while lower-severity alerts go elsewhere.
29. As an SRE, I want to create Routes that match status, so that firing and resolved notifications can be handled intentionally.
30. As an SRE, I want to create Routes that match labels, so that alerts for different services, environments, or clusters can go to the right place.
31. As an SRE, I want to create Routes that match title or message text, so that simple provider payloads can still be routed usefully.
32. As an SRE, I want one Route to send to multiple Destinations, so that one alert can notify more than one channel.
33. As an SRE, I want to disable a Route, so that I can pause a routing rule without deleting it.
34. As an SRE, I want route rules to be inspectable in the UI, so that I can understand why an alert matched or did not match.
35. As an SRE, I want message templates for Destinations, so that notifications contain the fields my team needs.
36. As an SRE, I want message templates to support safe variable interpolation, so that I can customize messages without running code.
37. As an SRE, I want to preview templates, so that I can see what a destination message will look like before enabling it.
38. As a security-conscious operator, I want templates and route rules to avoid user-provided JavaScript or shell execution, so that Tocsin does not become a remote code execution surface.
39. As an SRE, I want Deliveries to be asynchronous jobs, so that destination outages do not break inbound alert intake.
40. As an SRE, I want each Delivery to show pending, running, succeeded, or failed state, so that I can understand the current notification pipeline.
41. As an SRE, I want failed Deliveries to retry with backoff, so that transient Feishu, Slack, or network failures recover automatically.
42. As an SRE, I want Delivery history to include attempt count, next attempt time, last error, and timestamps, so that I can debug notification failures.
43. As an SRE, I want to manually retry a failed Delivery, so that I can recover after fixing a destination configuration.
44. As an SRE, I want an Events view, so that I can search and filter inbound alert history.
45. As an SRE, I want a Deliveries view, so that I can search and filter outbound notification history.
46. As an SRE, I want to filter by source, severity, status, destination, and delivery state, so that operational debugging is fast.
47. As an SRE, I want an Event detail view, so that I can see normalized fields, raw payload, route matches, and deliveries from one place.
48. As an SRE, I want a Delivery detail view, so that I can see destination config metadata, rendered payload, attempts, and errors.
49. As an SRE, I want Tocsin to have a simple owner/admin dashboard login, so that the admin UI is not public.
50. As an SRE, I want webhook intake to authenticate with Source tokens or Tocsin-side additional shared secrets instead of user sessions, so that upstream systems can send alerts without browser auth.
51. As the first operator of a new deployment, I want the first registered user to become owner/admin, so that setup works without a SaaS tenant flow.
52. As a self-hosting operator, I want one deployment to represent one team or environment, so that I do not need to configure organizations, tenants, or billing.
53. As a self-hosting operator, I want Tocsin to run with SQLite by default, so that I do not need to operate Redis or Postgres for a small private alert hub.
54. As a self-hosting operator, I want a single Docker image and data volume, so that installation and upgrades are straightforward.
55. As a self-hosting operator, I want explicit database migrations, so that upgrades are predictable and auditable.
56. As an SRE, I want configuration to be manageable from the UI, so that daily setup does not require editing config files.
57. As an SRE, I want TOML import/export for portable configuration, so that Tocsin can be backed up, reviewed, and moved between deployments.
58. As an SRE, I want secrets to be omitted from TOML exports by default, so that config files can be stored safely.
59. As an SRE, I want TOML config to support environment-variable references for secrets, so that Docker and Kubernetes deployments can inject credentials safely.
60. As a contributor, I want Tocsin-owned configuration to use TOML instead of YAML, so that config remains aligned with the project's preferred portable format.
61. As a contributor, I want reusable domain code separated from the app, so that integration contributions remain small and reviewable.
62. As a contributor, I want app orchestration, persistence, auth, and UI to remain in the app package, so that packages do not accidentally take runtime dependencies on the web app.
63. As a maintainer, I want the public MVP surface to be limited to inbound webhook endpoints and TOML format, so that the project does not prematurely commit to a full public management API.
64. As a maintainer, I want any starter/demo MCP code treated as non-product residue, so that future agents and contributors do not mistake it for the product architecture.
65. As an SRE, I want the UI to be dense, calm, and operational, so that alert triage and configuration are efficient.
66. As an SRE, I want enabled/disabled controls to be explicit, so that I can safely pause parts of the alert pipeline.
67. As an SRE, I want route matching and delivery behavior to be understandable without reading code, so that I can trust the alert pipeline.
68. As a maintainer, I want the MVP to avoid incident management concepts, so that alert routing ships before more complex lifecycle features.
69. As a maintainer, I want future silence and suppression concepts to have architectural room, so that they can be added later without rewriting Events and Deliveries.
70. As a maintainer, I want the system to avoid external middleware by default, so that Tocsin remains attractive to small private deployments.

## Implementation Decisions

- Tocsin will be built as a self-hosted Alert Hub for SRE and operations teams, not as a SaaS product and not as a general-purpose automation platform.
- The user-facing product language should emphasize Alerts, Sources, Routes, Destinations, Deliveries, Retry, and History.
- The internal persistence model should use immutable inbound Events. An Event records that a Source sent a webhook at a specific time, even if the payload represents a firing alert, a resolved alert, a test notification, a heartbeat, or a generic webhook.
- Each Source represents one upstream sender and should have its own webhook URL, Source token, and optionally a Tocsin-side additional shared secret. All providers should not share one unauthenticated generic endpoint.
- Source provider support should be implemented through a provider adapter registry. Provider adapters parse inbound payloads, validate or recognize payload shape, extract normalized fields, compute fingerprints or idempotency hints, and preserve provider metadata.
- Provider adapters must not perform routing, outbound delivery, retry handling, or destination secret access.
- Normalized event fields should include at least title, message, severity, status, fingerprint, labels, and occurred time.
- Routes should match normalized fields through simple, inspectable conditions: source matches, severity matches, status matches, label equals or contains, title contains, and message contains.
- Routes should send matching Events to one or more Destinations.
- Route rules should not use arbitrary JavaScript expressions, workflow graphs, scheduled steps, if/else pipelines, or general automation logic.
- Silence, suppression, maintenance windows, schedules, per-fingerprint mute, and alert grouping are future concepts, not MVP requirements.
- Each Destination represents one outbound integration such as Feishu, Slack, email, or generic webhook.
- Destination integrations should be implemented through a shared destination adapter interface with adapter-owned config schema and send behavior.
- Destination adapters should not own persistence, route matching, or retry orchestration.
- The app should own destination configuration storage, secret protection, adapter invocation, and Delivery result recording.
- Inbound webhook handling should save the Event, match Routes, create Delivery jobs, and return quickly when accepted for processing.
- Delivery should be asynchronous and backed by SQLite for the default deployment.
- Delivery states should include pending, running, succeeded, and failed.
- Delivery records should track Event reference, Destination reference, attempt count, next attempt time, last error, created timestamp, updated timestamp, and finished timestamp.
- Delivery retry should be bounded and use backoff so destination outages do not block inbound webhook intake.
- The MVP should use a single application process with an in-process SQLite-backed worker. It should not require Redis, Postgres, Kafka, Temporal, a separate worker service, or distributed queue semantics.
- The deployable shape should be one app image with a mounted data volume and environment variables for runtime configuration and secrets.
- The monorepo should expose reusable package boundaries for integrations: a core package for shared schemas and domain types, a providers package for inbound parsers, and a destinations package for outbound senders.
- App-level orchestration, UI, API routes, Better Auth, SQLite migrations, persistence repositories, and the in-process worker should remain in the application package.
- Adding a provider or destination should normally require an adapter implementation, fixtures, tests, registry registration, and UI work only when new configuration fields must be exposed.
- Alert identity and request idempotency should be separate concepts. Fingerprint identifies the upstream alert or monitored object; idempotency key identifies duplicate submissions of the same webhook request.
- Tocsin should store duplicate inbound Events for audit/debug purposes, but should avoid duplicate Deliveries for the same Source and idempotency key inside a short dedupe window.
- Fingerprint alone must not suppress repeated firing notifications, because many monitoring tools intentionally repeat firing alerts.
- Raw webhook payloads should be stored by default for debugging, replay, parser fixture creation, and audit history.
- Raw payload handling must include maximum request/payload size, redaction of common sensitive headers and fields, no source tokens or destination secrets in logs, and configurable retention.
- The UI should default to normalized alert fields, with raw payloads available only in detail/debug views.
- Destination secrets must stay server-side and must never be serialized into client route data or returned to the UI in plaintext.
- The primary configuration surface should be the UI.
- TOML should be the portable config-as-code format for Tocsin-owned configuration. Tocsin should not support YAML for its own configuration.
- Source, Route, Destination, and app settings should be structurally exportable to TOML.
- Secret values should not be exported to TOML by default; TOML should support environment-variable references for secrets.
- SQLite schema changes should use explicit forward-only migrations recorded in a migrations table.
- Business code should not scatter schema creation. Route handlers should delegate persistence to repositories or services.
- JSON payloads and config blobs should be validated with schemas at the boundary.
- The MVP stable external surface should be inbound webhook endpoints and, once implemented, TOML import/export format.
- Dashboard APIs may evolve with the UI and do not need to become a stable public REST API in the MVP.
- The authentication model should be single-workspace self-hosted. Dashboard access uses Better Auth; webhook intake uses Source tokens or Tocsin-side additional shared secrets.
- The first registered user may become owner/admin. SaaS-style tenants, billing, organizations, and complex invitation systems are out of scope.
- Message templates should use safe deterministic interpolation over normalized alert/event fields. Tocsin must not execute user-provided JavaScript, shell, SQL, or dynamic code from routes or templates.
- Starter/demo MCP code should not be treated as part of the Tocsin product architecture and should be removed or isolated when product work begins.
- The UI should be operational and efficient: clear tables, filters, detail views, test buttons, and explicit enable/disable controls. It should avoid marketing-style landing pages and decorative dashboards.

## Testing Decisions

- Good tests for this feature should assert external behavior at the highest practical seam: given a configured Source, Route, Destination, and payload, Tocsin should persist an Event, normalize alert fields, match routes, create Deliveries, and record delivery results.
- Provider adapter tests should use real or representative fixtures and assert normalized fields, fingerprints, idempotency hints, and provider metadata. They should not assert private parser implementation steps.
- Destination adapter tests should assert outbound request shape, secret handling behavior, rendered message content, and success/failure interpretation. They should use fake transports or mocked fetch-like boundaries rather than real Feishu or Slack calls.
- Routing tests should assert that simple route conditions match or do not match normalized events based on source, severity, status, labels, title, and message.
- Delivery worker tests should assert state transitions, retry scheduling, bounded retry behavior, and failure recording using a test SQLite database and fake destination adapters.
- Webhook endpoint tests should exercise request handling behavior: authentication by Source token/secret, payload size limits, raw payload persistence, normalized event creation, idempotency behavior, and accepted responses.
- Dedupe tests should verify that duplicate inbound requests are still recorded as Events while duplicate Deliveries are avoided within the dedupe window.
- Raw payload and secret tests should verify redaction, non-logging expectations where feasible, and that destination secrets are not serialized into client-visible data or TOML exports.
- Migration tests should apply migrations to an empty SQLite database and verify the expected tables and migration records exist. Future migrations should be tested from previous schema versions where practical.
- TOML import/export tests should verify that exported config is structurally readable, does not include plaintext secrets by default, and can represent Sources, Routes, Destinations, and app settings.
- UI tests should focus on user-visible workflows: creating a Source, copying its webhook URL, creating a Destination, testing the Destination, creating a Route, viewing Events, viewing Deliveries, filtering history, and inspecting failure details.
- Authentication tests should verify dashboard protection and that webhook endpoints do not depend on browser user sessions.
- There is no existing domain-specific test prior art in the current starter codebase. Use the existing test tooling declared by the workspace and introduce the highest-level seams above as the first meaningful product test seams.

## Out of Scope

- SaaS product architecture.
- Multi-tenant organization/workspace model.
- Billing, subscriptions, or hosted cloud plans.
- Redis, Postgres, Kafka, Temporal, or other required middleware for the default deployment.
- Separate API, frontend, and worker deployables for the MVP.
- Distributed queue semantics or multi-instance write coordination.
- General-purpose workflow automation like Zapier or n8n.
- Arbitrary JavaScript, shell, SQL, or dynamic-code execution in route rules or templates.
- Full incident management lifecycle.
- On-call scheduling, escalation policies, and paging rotations.
- Silence, suppression, maintenance windows, schedules, per-fingerprint mute, and alert grouping in the MVP.
- A stable public REST management API in the MVP.
- YAML import/export or YAML files for Tocsin-owned configuration; use TOML instead.
- Plaintext secret export in TOML.
- Treating starter/demo MCP code as product architecture.
- Provider-specific UI complexity beyond the fields required to configure Sources and Destinations.

## MVP Completion Notes

- The first usable product slice is complete enough to support a new planning
  cycle. Future work should stop expanding this MVP PRD and instead create
  narrower post-MVP PRDs.
- The most important carried-forward product quality remains trust: operators
  must be able to see what arrived, how it was normalized, why it routed, what
  was sent, whether it succeeded, and how failures retry.
- Known post-MVP candidates include destination-aware structured templates,
  richer Feishu/Slack/Email message formats, route authoring depth, alert
  suppression/maintenance windows, stronger search/filtering, production
  deployment hardening, and contributor experience for adapters.
- Capabilities that were explicitly out of scope here remain out of scope until
  a new PRD accepts them: SaaS tenancy, billing, incident lifecycle,
  on-call/escalation policy, distributed queue/runtime requirements, and a
  stable public management API.

## Further Notes

- `AGENTS.md` is the lightweight workflow contract for agents. Product scope
  and architecture guidance should live in this PRD or follow-up decision docs,
  not be duplicated there.
- The completed MVP should stay small enough for a private deployment to run
  comfortably on SQLite while leaving clear extension points for open-source
  provider and destination contributions.
