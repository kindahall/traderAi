<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:linear-context-rules -->
# Linear context continuity

Linear is connected to Codex through the `linear` MCP server. When a task mentions a Linear issue, project, cycle, or identifier, fetch the relevant Linear context before changing code. Prefer updating the related Linear issue/comment with concise progress notes when work materially changes scope, status, or implementation details.
<!-- END:linear-context-rules -->

<!-- BEGIN:application-creation-ux-competency -->
# Application creation UX competency

When creating or extending application pages, treat information architecture as a first-class feature.

- Do not stack every new configuration, connection, status, or explanation into the visible page. If a page grows because a feature was added, redesign the surface before adding more text.
- Prefer progressive disclosure: floating tabs, segmented controls, drawers, accordions, popovers, contextual panels, and focused workspaces.
- A user-facing page should expose one primary workflow or one active panel at a time. Secondary details must be reachable, not permanently visible.
- Keep dashboard cards compact. Do not make unrelated cards stretch because one panel contains a long form or connection flow.
- Connection flows such as exchange API, wallet, LLM provider, data source, or runtime setup must have clear actions, clear status, and their own contained panel.
- Before finishing a UI change, check that the page still feels usable for a non-technical user: clear labels, short text, visible actions, no wall of badges, no card nesting that makes the interface heavy.
<!-- END:application-creation-ux-competency -->
