# Tocsin Routes Configuration Page

Design the Routes page for Tocsin, a self-hosted Alert Hub console used by SREs to
inspect and configure how normalized inbound Events fan out to one or more
Destinations. Routes are simple matching rules over normalized fields; they are
not workflow automation, alert creation, silencing, or incident management.

**PLATFORM:** Web, desktop-first, responsive down to narrow dashboard widths.

**PAGE STRUCTURE:**

1. **App Shell:** Preserve the Tocsin console shell pattern from Events,
   Deliveries, and Sources: compact top navigation, active Routes item, dense
   work area, calm operational styling, and no global "Create Alert" action.

2. **Page Toolbar:** A compact bordered toolbar above the table with:
   - Title "Routes"
   - Short description about matching normalized event fields and sending
     matching events to destinations
   - Count label such as "4 configured"
   - Secondary utility action "Refresh"
   Avoid marketing copy and avoid tenants, teams, billing, incident lifecycle,
   silences, maintenance windows, or workflow automation language.

3. **Primary Routes Table:** A dense table as the main left-side surface.
   Columns should support fast route review:
   - Route: name and short id fragment
   - Match rule: readable chips for source, severity, status, labels, title
     contains, and message contains; show "All events" when no conditions exist
   - Destinations: count plus destination names when available
   - State: enabled or disabled badge
   - Row actions: edit and enable/disable only
   Enable and disable actions must feel explicit and reviewable.

4. **Right Rail Create/Edit Form:** A persistent right rail for creating a Route.
   Use compact labeled fields:
   - Route name
   - Source select, with "Any source"
   - Severity select, with "Any", "Critical", "Warning", "Info", "Unknown"
   - Status select, with "Any", "Firing", "Resolved", "Unknown"
   - Label matcher group with key, operator equals/contains, and value
   - Title contains
   - Message contains
   - Destination checklist
   - Create route button
   When editing an existing Route, show a compact inline edit panel below the
   table or in the same right rail with Save and Cancel. Preserve the user's
   context in the table.

5. **Safety and Empty States:** Include compact empty state treatment for no
   routes. Include clear disabled states when there are no Destinations because
   routes must send matching events to at least one Destination.

**PRODUCT BOUNDARIES:**

- Do not add arbitrary JavaScript, SQL, shell, expression editors, workflow
  graphs, branching pipelines, schedules, silences, suppressions, maintenance
  windows, on-call escalation, incident management, billing, SaaS tenant
  management, organization invites, OAuth app setup, or marketplace browsing.
- Do not expose source tokens, token hashes, destination secrets, provider
  signing secrets, or raw sensitive payloads.
- Keep Routes focused on matching normalized event fields and selecting
  Destinations.

**IMPLEMENTATION MAPPING NOTES:**

- Map the design to existing React feature modules:
  `RoutesPage`, `RoutesSection`, `CreateRouteForm`, `EditRouteForm`, and
  route rule summary helpers.
- Use existing shadcn primitives such as Button, Badge, Table, Alert, Empty,
  Field, Input, NativeSelect, and Checkbox.
- Keep TanStack Form as the form behavior owner and shadcn Field primitives as
  presentation.
- Keep server state TanStack Query-backed through existing route mutations and
  configuration query options.
