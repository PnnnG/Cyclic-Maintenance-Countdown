"""Constants for Maintenance Countdown."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "cyclic_countdown"
DEFAULT_INTEGRATION_TITLE: Final = "Maintenance Countdown"
LEGACY_DEFAULT_INTEGRATION_TITLE: Final = "Cyclic Maintenance Countdown"
CONFIG_ENTRY_VERSION: Final = 2
FRONTEND_PATH: Final = "/cyclic_countdown/cyclic-countdown-card.js"
PLATFORMS: Final = ["sensor"]
STORAGE_KEY: Final = f"{DOMAIN}.tasks"
STORAGE_VERSION: Final = 2
STORAGE_MINOR_VERSION: Final = 2
SERVICE_COMPLETE: Final = "complete"
SIGNAL_TASKS_UPDATED: Final = f"{DOMAIN}_tasks_updated"

DEFAULT_ICON: Final = "mdi:wrench-clock"
DEFAULT_WARNING_DAYS: Final = 1
DEFAULT_NOTIFICATION_MESSAGE: Final = "{name}: {days} · {due_date}"
MAX_INTERVAL_DAYS: Final = 3650

EVENT_CREATED: Final = "created"
EVENT_UPDATED: Final = "updated"
EVENT_DELETED: Final = "deleted"
EVENT_COMPLETED: Final = "completed"
EVENT_REFRESHED: Final = "refreshed"
