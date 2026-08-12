# Contributing to Maintenance Countdown

Bug reports, focused feature requests, documentation fixes, and tested code changes are welcome.

## Before opening an issue

- Update to the latest Maintenance Countdown release supported by your Home Assistant version.
- Restart Home Assistant and refresh any browser or Companion client that was already open.
- Search the existing issues for the same behavior.
- Do not post notification contents, private URLs, access tokens, or other secrets.

Use the provided issue forms so reports include the versions, client, logs, and reproduction steps needed to investigate them.

## Development checks

Backend changes must pass the supported Home Assistant test matrix, Ruff, formatting, and coverage checks. Frontend changes must pass linting, type checking, unit tests, and a clean production build. The committed frontend bundle must match its source.

```text
cd frontend
pnpm install
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build
```

Changes affecting Home Assistant or Companion behavior must also pass the relevant checks in [docs/development/release-checklist.md](docs/development/release-checklist.md). In particular, a component stub is not sufficient evidence for native icon-picker or client-loading behavior.

## Pull requests

- Keep each pull request focused on one problem.
- Explain the user-visible behavior before and after the change.
- Add regression tests for bug fixes.
- Update user documentation when behavior or configuration changes.
- Do not rename the stable `cyclic_countdown` domain, action namespace, card type, storage key, or CSS variables as part of a product-name change.
