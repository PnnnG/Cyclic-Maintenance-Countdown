# Changelog

All notable changes to Cyclic Maintenance Countdown are documented here.

## 0.1.2 — 2026-08-10

- Add the integration version to the automatically registered card module URL so Home Assistant clients cannot reuse a stale frontend module after an update.
- Localize the visual card picker entry in Russian and verify its registration in frontend tests.

## 0.1.1 — 2026-08-10

- Show Cyclic Maintenance Countdown as an installed integration instead of routing it to Helpers.
- Fix the missing handler error when opening the configured entry.
- Improve setup and duplicate-instance translations in English and Russian.
- Load the Lovelace card automatically through Home Assistant's supported frontend module API.

## 0.1.0 — 2026-08-10

- Initial UI-configured Home Assistant integration with versioned task storage.
- Dynamic countdown sensors and `cyclic_countdown.complete` action.
- Admin WebSocket CRUD, completion, notification target discovery and test delivery.
- Calendar-day scheduling, restart reconciliation and idempotent warning/due notifications.
- Theme-aware Lit card in `bar` and `fill` styles with reverse progress.
- Normal, warning, due, overdue and just-completed states.
- Visual task/card editor with RU/EN UI and live state preview.
- Light, dark, glass/blur and reduced-motion support.
- Production frontend bundle, tests, HACS metadata and validation workflow.
