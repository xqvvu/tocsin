# Tocsin Sources Configuration Page

Design the Sources page for Tocsin, a self-hosted Alert Hub console used by SREs
to manage inbound webhook senders such as Grafana, SigNoz, Uptime Kuma,
Alertmanager, and generic systems. The page should make it easy to create a
Source, copy its webhook URL, rotate its token, disable noisy senders, and
understand which upstream systems are allowed to create Events.

**PLATFORM:** Web, desktop-first, responsive down to narrow dashboard widths.

**PAGE STRUCTURE:**

1. **App Shell:** Preserve the Tocsin console shell pattern from the Events and
   Deliveries screens: compact top navigation, active Sources item, dense work
   area, and calm operational styling.

2. **Page Toolbar:** A compact bordered toolbar above the table with:
   - Title "Sources"
   - Short description about inbound webhook senders, provider parsers, tokens,
     and safe intake
   - Count label such as "5 configured"
   - Primary action "New source" or a create form affordance
   - Secondary utility action only if needed, such as "Refresh"
   Avoid marketing copy and avoid any concept of tenants, teams, or billing.

3. **Primary Sources Table:** A dense table as the main left-side surface.
   Columns should support fast source administration:
   - Source: name, provider, and short id fragment
   - Webhook: source-specific webhook path in a monospace copyable code chip
   - Auth: token configured / provider secret configured / masked state
   - State: enabled or disabled badge
   - Last received or recent activity placeholder if available
   - Row actions: edit, copy webhook URL, rotate token, enable/disable
   Disable and rotate token actions must feel explicit and reviewable.

4. **Right Rail Create/Edit Form:** A persistent right rail for creating a new
   Source. Use compact labeled fields:
   - Source name
   - Provider select with Generic, Grafana, SigNoz, Uptime Kuma, Alertmanager
   - Optional provider signing secret / shared secret field
   - Create source button
   When editing an existing Source, show an inline edit panel or form section
   with Save and Cancel. Preserve the user's context in the table.

5. **One-Time Token Notice:** Include a compact alert panel for newly created or
   rotated Source tokens. It must communicate:
   - The token is shown once
   - The webhook URL can be copied
   - The token can be copied
   - Secrets should not be exposed again after dismissing or navigating away
   The notice should be clear but not visually loud.

6. **Safety and Empty States:** Include compact empty state treatment for no
   sources. Include clear disabled states for pending actions.

**PRODUCT BOUNDARIES:**

- Do not add SaaS tenant management, organization invites, billing, OAuth app
  setup, source marketplace browsing, workflow automation, or incident
  management concepts.
- Do not expose token hashes, stored source tokens, provider signing secrets,
  destination secrets, or unredacted webhook URLs with embedded secrets.
- Source tokens may appear only in the one-time post-create or post-rotate
  notice.
- Keep Sources focused on inbound webhook intake and provider parsing.

**IMPLEMENTATION MAPPING NOTES:**

- Map the design to existing React feature modules:
  `SourcesPage`, `SourcesSection`, `CreateSourceForm`, `EditSourceForm`,
  `SourceTokenNoticePanel`, and `SourceWebhookCell`.
- Use existing shadcn primitives such as Button, Badge, Table, Alert, Empty,
  Field, Input, NativeSelect, and Checkbox.
- Keep TanStack Form as the form behavior owner and shadcn Field primitives as
  presentation.
- Keep server state TanStack Query-backed through existing source mutations and
  configuration query options.
