# Tocsin Console - Application Error

Design an application error boundary screen for the Tocsin self-hosted alert hub
console. This is for unexpected route loader or runtime failures, not a 404
page.

**PLATFORM:** Web, desktop-first.

**PAGE STRUCTURE:**
1. **Application Frame:** Preserve the authenticated Tocsin console context with
   compact navigation and header cues. The page should feel like an operational
   dashboard fallback inside the existing app shell, not a marketing landing
   page.
2. **Primary Error Panel:** Use a dense console-style failure state. Include a
   restrained title such as "Application error", a compact status badge or code
   chip such as "ERROR", a short explanation that the console could not render
   this view, and a safely redacted error summary area. The summary should show
   only a generic message line and avoid stack traces, secrets, tokens, webhook
   URLs, raw payloads, or provider credentials.
3. **Recovery Actions:** Provide a compact action toolbar with a primary "Try
   again" action, a secondary "Reload page" action, and navigation links to
   Events, Sources, Routes, and Settings. Keep actions practical and small, not
   hero-sized.
4. **Diagnostic Panel:** Add a right-side fixed-width panel with an operator
   checklist: retry the request, confirm dashboard session, verify local
   SQLite/runtime configuration, check server logs, and review recent
   configuration changes. Present this as factual SRE guidance with small rows
   and icon-label pairs.
5. **Context Metadata Strip:** Include small muted metadata such as "Tocsin Console
   / error boundary / runtime failure", current route context, and a timestamp
   placeholder. Use monospaced chips for route and request-like identifiers.

The design should be utilitarian, precise, compact, panel-oriented, and
consistent with existing Tocsin console screens. Avoid decorative illustrations,
oversized hero typography, marketing copy, SaaS/billing/organization language,
incident-management controls, on-call concepts, or any "Create Alert" action.
