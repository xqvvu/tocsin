# Tocsin Destinations Configuration Page

Design the Destinations page for Tocsin, a self-hosted Alert Hub console used by
SREs to configure outbound notification targets such as Feishu, Slack, email,
and generic webhooks. Destinations receive delivery jobs created by Routes and
can be tested or previewed without exposing stored secrets.

**PLATFORM:** Web, desktop-first, responsive down to narrow dashboard widths.

**PAGE STRUCTURE:**

1. **App Shell:** Preserve the Tocsin console shell pattern from Events,
   Deliveries, Sources, and Routes: compact top navigation, active Destinations
   item, dense work area, calm operational styling, and no global "Create Alert"
   action.

2. **Page Toolbar:** A compact bordered toolbar above the table with:
   - Title "Destinations"
   - Short description about outbound notification targets, message templates,
     test sends, and safe secret handling
   - Count label such as "4 configured"
   - Secondary utility action "Refresh"
   Avoid marketing copy and avoid tenants, teams, billing, marketplace browsing,
   incident lifecycle, on-call escalation, or workflow automation.

3. **Notice Area:** Compact alert panels above the table when present:
   - Test result notice: destination name, accepted/failed state, optional status
     code, redacted response or error
   - Preview notice: destination name and a scrollable rendered payload preview
   These notices must not reveal webhook URLs, signing secrets, access tokens,
   passwords, private keys, or raw unredacted downstream responses.

4. **Primary Destinations Table:** A dense table as the main left-side surface.
   Columns should support fast administration:
   - Destination: name and short id fragment
   - Kind: Generic webhook, Feishu, Slack, or Email badge
   - Safe config summary: describe the target type without showing URL or secret
     values, for example "Webhook endpoint stored server-side" or "Email gateway
     config stored server-side"
   - State: enabled or disabled badge
   - Row actions: Test, Preview, Edit, Enable/Disable
   Test, preview, and enable/disable actions must feel explicit and reviewable.

5. **Right Rail Create/Edit Form:** A persistent right rail for creating a
   Destination. Use compact labeled fields:
   - Destination name
   - Kind select with Generic webhook, Feishu, Slack, Email
   - Kind-specific secret-bearing fields such as webhook URL, email gateway URL,
     headers, Feishu sign secret, and message template
   - Preview button
   - Create destination button
   When editing an existing Destination, show a compact inline edit panel below
   the table or in the same right rail with Save, Preview, and Cancel. Preserve
   the user's context in the table.

6. **Safety and Empty States:** Include compact empty state treatment for no
   destinations. Include clear copy that routes require at least one destination
   before they can send delivery jobs.

**PRODUCT BOUNDARIES:**

- Do not expose destination webhook URLs, signing secrets, access tokens,
  passwords, private keys, source tokens, token hashes, provider signing
  secrets, raw unredacted downstream responses, or raw sensitive payloads.
- Do not add incident management, on-call schedules, silences, suppression,
  workflow graphs, arbitrary JavaScript, SQL, shell execution, OAuth app setup,
  billing, SaaS tenant management, organization invites, or marketplace
  browsing.
- Keep Destinations focused on outbound adapters, safe template preview, test
  sends, enable/disable, and server-side secret storage.

**IMPLEMENTATION MAPPING NOTES:**

- Map the design to existing React feature modules: `DestinationsPage`,
  `DestinationsSection`, `CreateDestinationForm`, `EditDestinationForm`,
  `DestinationTestNoticePanel`, and `DestinationPreviewNoticePanel`.
- Use existing shadcn primitives such as Button, Badge, Table, Alert, Empty,
  Field, Input, NativeSelect, Checkbox, and Textarea.
- Keep TanStack Form as the form behavior owner and shadcn Field primitives as
  presentation.
- Keep server state TanStack Query-backed through existing destination
  mutations and configuration query options.
