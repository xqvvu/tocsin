# Tocsin Console - 404 Not Found

Design a 404 not found screen for the Tocsin self-hosted alert hub console.

**PLATFORM:** Web, desktop-first.

**PAGE STRUCTURE:**
1. **Application Frame:** Preserve the operational console feeling with the Tocsin navigation and compact top header context. The screen must feel like an authenticated dashboard page, not a marketing landing page.
2. **Main Content Area:** Use a dense console-style empty-state composition for a missing route. Include a restrained title such as "Route not found", a compact "404" badge or code chip, the current path shown as a monospaced code fragment, and a concise explanation that the URL does not match a console route.
3. **Recovery Actions:** Provide clear operational actions: a primary button to return to the console home or Sources page, secondary buttons or links for Events, Routes, and Settings. Actions should be grouped in a compact toolbar style rather than oversized hero CTAs.
4. **Diagnostic Panel:** Add a right-side or lower information panel with a short checklist: verify the URL, use registered console routes, review route configuration, and use navigation links. Keep it factual and SRE-oriented.
5. **Footer/Metadata Strip:** Include small muted metadata such as "Tocsin Console / navigation guard / 404" and avoid decorative illustrations, incident management, on-call, billing, organization, or SaaS language.

The design should be utilitarian, precise, compact, table-and-panel oriented, and consistent with the existing Tocsin console screens. Avoid a marketing hero, oversized typography, decorative graphics, gradients, or any "Create Alert" action.
