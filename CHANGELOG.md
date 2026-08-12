# Changelog

Notable user-facing changes to Maintenance Countdown are documented here. The project is still in pre-release; the complete development record remains available in the [GitHub releases](https://github.com/PnnnG/Maintenance-Countdown/releases) and repository history.

## Unreleased

- Rename the public product from **Cyclic Maintenance Countdown** to **Maintenance Countdown** before the first stable release.
- Keep the established `cyclic_countdown` integration domain, `cyclic_countdown.complete` action, `custom:cyclic-countdown-card` card type, and stored task data compatible with existing pre-release installations.
- Replace the developer-oriented README with a guided installation, feature overview, real product screenshots, troubleshooting, and advanced details kept out of the primary path.

## 0.3.1 — 2026-08-12

- Stabilize the first opening of Home Assistant's native icon picker in Companion and retry icon-index discovery after editor reconnection.

## 0.3.0 — 2026-08-12

- Register the bundled card as one persistent, versioned Lovelace resource, with duplicate cleanup and a safe fallback for YAML or storage failures.
- Harden task persistence with atomic copy-on-write updates, schema validation, corrupt-record isolation, and storage migration coverage.
- Serialize notification reconciliation, isolate destination failures, bound delivery calls, and prevent stale reload workers from mutating current task data.
- Preserve unsaved editor drafts across mode changes and reconnections while rejecting late save, delete, load, and completion responses.
- Apply Home Assistant-local calendar arithmetic consistently to sensors, notifications, previews, and optimistic completion.
- Strengthen authorization, keyboard access, non-color state indicators, CI validation, and real Home Assistant integration tests.

## 0.2.0–0.2.4 — 2026-08-10

- Refine new-task and existing-task workflows so drafts and saved selections survive mode changes without silently replacing a configured task.
- Make notification tests use the current unsaved editor values and improve notification-target discovery without hiding valid compatible actions.
- Improve native icon search readiness and mobile picker updates during first-time card creation.
- Introduce Compact, Standard, and Wide vertical layouts while preserving Home Assistant's native horizontal card sizing.
- Replace long secondary labels with a compact semantic icon and date, retaining accessible descriptions.
- Normalize custom icon names, clarify task-versus-card storage, and adopt Home Assistant's native card radius.

## 0.1.0–0.1.9 — 2026-08-10

- Introduce the UI-configured integration, versioned task storage, countdown sensors, completion action, and administrator WebSocket API.
- Add calendar-day scheduling, warning and due notifications, restart reconciliation, and persistent Home Assistant notifications.
- Ship the theme-aware Lit card, visual editor, live state preview, English and Russian UI, and normal through overdue states.
- Add configurable tap, hold, and double-tap actions with safe defaults and confirmation before completion.
- Add Compact layout, glass and reduced-motion support, local brand assets, automatic frontend loading, HACS metadata, tests, and validation workflows.
