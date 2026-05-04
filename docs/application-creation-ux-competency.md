# Application Creation UX Competency

This project treats information architecture as a product feature.

When a page gains new settings, connections, statuses, or actions, the default response is not to add another block of text. The page must stay usable for a normal user who wants to understand where to click and what state the app is in.

## Core Rule

Use progressive disclosure before adding visible complexity.

Good patterns:

- Floating tabs for major categories.
- Segmented controls for modes.
- Drawers or panels for setup flows.
- Accordions for optional details.
- Compact status badges for state.
- Dedicated connection panels for APIs, wallets, providers, and runtimes.

Avoid:

- Long stacked configuration cards.
- Cards inside cards.
- Every feature visible at once.
- Status badges that turn into paragraphs.
- Forms that stretch unrelated columns.
- Explanatory text that replaces clear actions.

## Page Review Checklist

Before finishing a page or app:

- Is there one primary workflow visible?
- Can secondary information be reached without permanently occupying the page?
- Are actions obvious without explanatory text?
- Did any new feature make the layout taller, heavier, or harder to scan?
- Would a non-technical user know what to click next?
- Does the page still look intentional after real data, errors, and connection states appear?

If the answer is no, redesign the surface with tabs, panels, drawers, or another focused navigation pattern before adding more content.
