# Maintainer release checklist

Use this checklist for every pre-release and stable release. A green unit-test run is necessary but does not replace the Home Assistant and Companion checks below.

## Automated gates

- [ ] Backend lint, format check, coverage threshold, and the complete test suite pass on the minimum and latest supported Home Assistant versions.
- [ ] Frontend lint, typecheck, unit tests, and production build pass.
- [ ] The committed JavaScript bundle and source map are unchanged after a clean production build.
- [ ] hassfest and HACS validation pass.
- [ ] Backend and frontend package versions match, and a release tag is exactly `v<version>`.

## Home Assistant smoke test

Run on both the minimum and latest supported Home Assistant versions.

- [ ] Install as a new HACS custom integration, restart Home Assistant, add the integration, and add the first card without YAML.
- [ ] Confirm that exactly one versioned Lovelace module resource exists and that unrelated resources remain unchanged.
- [ ] Open the icon picker before choosing any icon. Type a multi-character query one character at a time and confirm that every character refreshes the results.
- [ ] Create, edit, switch, complete, and delete tasks; verify the sensor state and entity registry after every operation.
- [ ] Edit a task without saving, change an appearance setting, switch task modes, and reconnect the frontend; confirm that the draft is not lost or applied to another task.
- [ ] Verify Compact, Standard, and Wide layouts in Bar and Fill styles using light, dark, and transparent/glass themes.
- [ ] Verify normal, warning, due, overdue, and reduced-motion states without relying on color alone.
- [ ] Send a test from unsaved notification values. Verify partial target failure, persistent notifications, warning delivery, due catch-up, and no routine repeat after a successful delivery marker.
- [ ] Reload the integration while a notification target is slow; confirm that startup remains responsive, no task update is rolled back, and no stale callback remains active.
- [ ] Open or reload the dashboard at least ten times and confirm there is no `Configuration error`, browser-console exception, or Home Assistant log error.

## Companion smoke test

- [ ] Repeat first-open icon search and card creation in the current iOS or Android Companion app.
- [ ] Fully close and reopen Companion several times; confirm that every card loads without a manual dashboard refresh.
- [ ] Verify tap, hold, and double-tap actions, plus the completion confirmation dialog.

## Release metadata

- [ ] Replace the `Unreleased` changelog section with the exact version and date.
- [ ] Update `custom_components/cyclic_countdown/manifest.json` and `frontend/package.json` to the same new version.
- [ ] Confirm the Maintenance Countdown product name and `PnnnG/Maintenance-Countdown` links agree across the manifest, HACS metadata, translations, card picker, and README.
- [ ] Open the README's HACS repository and config-flow buttons against a clean Home Assistant test instance.
- [ ] Confirm the version has never been published or tagged before.
- [ ] Mark the GitHub release as a pre-release until the stable-release checklist has been completed.
- [ ] Create the Git tag only after all checks above are recorded as complete.
