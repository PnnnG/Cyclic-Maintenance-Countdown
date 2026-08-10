# Changelog

All notable changes to Cyclic Maintenance Countdown are documented here.

## 0.2.0 — 2026-08-10

- Center the three height labels explicitly in their editor cells.
- Use the native Home Assistant card radius instead of forcing larger Bar and Fill corner radii.
- Keep card-picker metadata current after a frontend update without requiring a full Home Assistant restart.
- Normalize manually entered icon names, accept Home Assistant custom icon sets, and surface validation errors in the editor.
- Clarify that task data is saved separately from the Lovelace card configuration.

## 0.1.9 — 2026-08-10

- Add a one-row Compact height with a smaller icon and day count, a thinner progress bar, and no secondary line.
- Keep secondary-line preferences stored so switching back to Standard or Wide restores them.

## 0.1.8 — 2026-08-10

- Make Standard and Wide update the actual Lovelace grid height (`auto` or two rows) while leaving the horizontal width unchanged.
- Preserve existing column sizing and other Home Assistant grid options when changing the card height.

## 0.1.7 — 2026-08-10

- Restore native Home Assistant horizontal card width.
- Apply Standard and Wide to the vertical card size: Standard uses natural compact height, while Wide keeps the taller two-row layout.
- Convert the short-lived `width` option from 0.1.4–0.1.6 to `vertical_size` without losing the selected value.

## 0.1.6 — 2026-08-10

- Preserve the explicitly stored actions of existing cards during updates.
- Keep the new-card defaults at tap for More info, hold for Complete, and double tap for No action.

## 0.1.5 — 2026-08-10

- Migrate cards created with the original gesture defaults to tap for More info and hold for Complete.
- Make Standard cards visibly compact with a fluid 28 rem cap while Wide cards use the full available container.
- Request the native six-column standard and twelve-column wide spans in Home Assistant Sections views.

## 0.1.4 — 2026-08-10

- Recalculate the live preview immediately from the edited completion date, interval, and warning window; keep manual phase simulation as an explicit preview mode.
- Add Standard and Wide card widths, with a fluid theme-overridable standard width.
- Add configurable tap, hold, and double-tap actions with Complete, More info, and No action available for each gesture.
- Use the safer defaults: tap opens More info, hold completes, and double tap does nothing.
- Add optional persistent Home Assistant notifications, including storage migration and test delivery.
- Replace browser-native checkboxes with a theme-aware control and improve Russian editor copy.

## 0.1.3 — 2026-08-10

- Add a dark-mode brand icon so HACS can display the integration artwork in dark themes.
- Keep the product name `Cyclic Maintenance Countdown` untranslated in the card picker.
- Return a standards-compliant stub configuration without `type` and disable the live picker preview that could remain stuck loading.

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
