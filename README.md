# Cyclic Maintenance Countdown

A polished, UI-first Home Assistant integration and Lovelace card for recurring household maintenance: replacing filters, adding septic bacteria, refilling salt, cleaning containers, and similar tasks.

Each card displays one maintenance task. The backend is the single source of truth for dates, survives restarts, exposes a sensor for every task, and sends notifications even when no dashboard is open.

## Features

- Calendar-day countdown in the Home Assistant local timezone: `13`, `0`, `-1`, and so on without automatically rolling overdue tasks forward.
- A new cycle always starts from the actual completion date.
- Two responsive presentation styles: `bar` and `fill`.
- Standard compact and wide vertical card layouts.
- Normal and reversed visual progress direction.
- Explicit `normal`, `warning`, `due`, `overdue`, and short `just_completed` states.
- Soft theme-aware gradients and breathing effects with a static reduced-motion fallback.
- Light, dark, glass/blur, flat, and custom theme support.
- Full visual editor for tasks, appearance, behavior, and notifications.
- Modern notify entities, compatible legacy mobile-app notify actions, and optional persistent Home Assistant notifications.
- Safe `{name}`, `{days}`, and `{due_date}` placeholders without Jinja execution.
- English and Russian UI selected automatically from Home Assistant language settings.
- `cyclic_countdown.complete` action and one countdown sensor per task.

## Language behavior

English is the primary language and the universal fallback.

- `hass.locale.language` is used first, followed by `hass.language`.
- Any locale beginning with `ru` uses Russian.
- English is used for every other locale, including unknown or unsupported languages.
- Backend strings use Home Assistant translation JSON files.
- The frontend uses a small built-in dictionary, avoiding a large runtime i18n dependency.

Adding another language only requires a backend translation JSON file and one compact frontend dictionary entry.

## Requirements

- Home Assistant Core 2026.7 or newer.
- A modern browser supported by the corresponding Home Assistant release.
- HACS is optional and is only used for convenient installation.

## Installation with HACS

Until the repository is included in the default HACS catalog, add it as a custom repository:

1. Open HACS, use the menu, and select **Custom repositories**.
2. Add this repository URL with the **Integration** category.
3. Install **Cyclic Maintenance Countdown** and restart Home Assistant.
4. Open **Settings → Devices & services → Add integration**, find `Cyclic Maintenance Countdown`, and confirm installation.
5. Reload the Home Assistant frontend once after adding the integration so the newly registered card module is available to every open client.

The integration registers its card module through Home Assistant's supported frontend API. No manual Lovelace resource is required.

### Manual installation

Copy `custom_components/cyclic_countdown` into `<config>/custom_components/cyclic_countdown`, restart Home Assistant, and complete step 4 above.

## Create the first task without YAML

1. Edit a dashboard and select **Add card**.
2. Choose **Cyclic Maintenance Countdown**.
3. In the **Task** section, select **Create a new task**.
4. Enter a name, choose an MDI icon, set the interval and warning window, then select the last completion date or press **Today**.
5. Configure appearance, behavior, and notifications. The live preview follows the entered dates immediately; its menu can also simulate `normal`, `warning`, `due`, and `overdue` without changing the real task.
6. Select **Create task**, then save the card.

The editor uses Home Assistant's `ha-icon-picker` when available. If that frontend component is unavailable, it automatically falls back to a regular `mdi:...` text field. The card itself does not depend on the picker.

## Visual editor

The graphical editor includes:

- existing task selection, creation, update, and confirmed deletion;
- task name, MDI icon, interval, last completion date, and warning window;
- calculated due-date preview before saving;
- `bar` and `fill` style thumbnails;
- standard/wide vertical size, reverse progress, optional accent color, secondary-line controls, and live phase preview;
- completion confirmation plus independent tap, hold, and double-tap actions;
- notification enablement, multiple targets, persistent Home Assistant notifications, title, message, event selection, preview, and test delivery;
- clear missing-integration, missing-task, unavailable-target, and backend-error states.

## Completing a task

By default, a tap opens the entity's more-info dialog, holding the card completes the task after confirmation, and double tap has no action. All three gestures can independently be set to **Complete**, **More info**, or **No action**. After completion, the backend atomically stores today's local date and calculates the new due date. The card updates optimistically while the request is pending and rolls back with a visible error if the request fails.

The same operation is available to automations and Developer Tools:

```yaml
action: cyclic_countdown.complete
data:
  task_id: 2f96074a-8a53-4b35-bb80-d8ce560cf888
```

## Notifications

The editor lists currently available notify entities and compatible legacy notify actions. A removed target remains visible as unavailable, and one failed target does not stop delivery to the others.

- A warning notification is sent once per cycle when the task enters its warning window.
- A due notification is sent once per cycle.
- A persistent notification can be created in Home Assistant's notification panel independently of mobile notification targets.
- Startup reconciliation catches up an event missed while Home Assistant was offline.
- Overdue tasks do not generate daily repeats.
- Completing a task creates a new `cycle_id` and a fresh set of idempotency markers.

The **Send test** button is available after the task has been saved once.

## YAML card configuration

The visual editor is the primary configuration method. An equivalent portable configuration is:

```yaml
type: custom:cyclic-countdown-card
task_id: 2f96074a-8a53-4b35-bb80-d8ce560cf888
style: bar
vertical_size: standard
reverse_progress: false
confirm_complete: true
show_secondary: true
secondary_info: last_completed
tap_action: more-info
hold_action: complete
double_tap_action: none
```

Task and notification settings are stored by the backend and are not duplicated in each card configuration.

## Sensor entity

Each task creates `sensor.<name>_countdown` with a stable UUID-based `unique_id`. Its state is the integer number of remaining days and its unit is `d`.

Public attributes include `task_id`, task name, icon, interval, dates, `remaining_days`, `elapsed_progress`, `phase`, and `warning_days`. Notification contents, targets, cycle IDs, and delivery markers are deliberately excluded from the state machine. No `state_class` is assigned.

## Themes, glass effects, and card-mod

The card inherits Home Assistant variables including:

- `--ha-card-background`, `--card-background-color`, and `--ha-card-backdrop-filter`;
- `--ha-card-border-color` and `--ha-card-box-shadow`;
- primary and secondary text colors;
- divider, accent, warning, error, and success colors.

Transparent theme surfaces remain transparent, so glass/blur, neumorphic, flat, and high-contrast themes keep their visual character. Progress and status gradients remain below the content, while the icon tile is rendered as a distinct surface above those layers.

Optional fine-grained variables:

- `--cyclic-countdown-background`
- `--cyclic-countdown-backdrop-filter`
- `--cyclic-countdown-border`
- `--cyclic-countdown-shadow`
- `--cyclic-countdown-icon-background`
- `--cyclic-countdown-icon-border`
- `--cyclic-countdown-icon-shadow`
- `--cyclic-countdown-icon-backdrop-filter`
- `--cyclic-countdown-warning-color`
- `--cyclic-countdown-danger-color`

These variables can be provided by a theme or card-mod. card-mod is not a required dependency.

## Accessibility

- Minimum interactive target size of 44×44 px.
- Keyboard activation and visible focus ring.
- Localized ARIA descriptions.
- Text labels in addition to color for warning, due, and overdue phases.
- Motion uses opacity and transform only.
- `prefers-reduced-motion` disables repeating animation while preserving a static status tint.

## Updating and removing

- Back up Home Assistant before updating, then install the new release through HACS.
- Persistent data uses a versioned schema and is migrated during integration startup.
- Tasks are deleted only after confirmation. Existing cards remain and display **Task not found**.
- For complete removal, delete the cards and tasks, then remove the integration and component directory.

## Development

Frontend:

```text
cd frontend
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

The production bundle is generated at `custom_components/cyclic_countdown/frontend/cyclic-countdown-card.js` and is installed with the backend through HACS.

Backend tests target `pytest-homeassistant-custom-component`. CI runs Python tests and linting, frontend typecheck/tests/build, hassfest, and HACS validation.

Useful local visual harnesses:

- `frontend/test/visual-harness.html` — card styles, phases, and light/dark/glass themes.
- `frontend/test/editor-harness.html` — full visual editor with mocked task and notification data.

## Architecture

- `TaskManager` owns versioned storage and is the single source of truth.
- Sensor entities receive push updates; there is no per-second polling.
- Local midnight and core timezone changes refresh derived states and notification reconciliation.
- WebSocket create/update/delete and notification management require admin permission.
- Completion checks entity control permission.
- The frontend never stores canonical dates in local storage.

Persistent data is stored in `.storage/cyclic_countdown.tasks`. Private notification contents are never included in diagnostic logs or sensor attributes.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
