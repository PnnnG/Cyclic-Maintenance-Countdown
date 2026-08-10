"""Domain models and calendar calculations."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

from .const import (
    DEFAULT_ICON,
    DEFAULT_NOTIFICATION_MESSAGE,
    DEFAULT_WARNING_DAYS,
    MAX_INTERVAL_DAYS,
)


class TaskValidationError(ValueError):
    """Raised when task input is invalid."""


ICON_PATTERN = re.compile(r"^[a-z0-9_-]+:[a-z0-9]+(?:-[a-z0-9]+)*$")


def parse_date(value: str | date) -> date:
    """Parse a local calendar date."""
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as err:
        raise TaskValidationError("last_completed_date must be an ISO date") from err


def calculate_due_date(last_completed_date: date, interval_days: int) -> date:
    """Return the next due date."""
    return last_completed_date + timedelta(days=interval_days)


def calculate_remaining_days(due_date: date, today: date) -> int:
    """Return calendar days until due, preserving negative overdue values."""
    return (due_date - today).days


def calculate_elapsed_progress(interval_days: int, remaining_days: int) -> float:
    """Return elapsed progress clamped to [0, 1]."""
    return min(1.0, max(0.0, (interval_days - remaining_days) / interval_days))


def calculate_phase(remaining_days: int, warning_days: int) -> str:
    """Return the explicit task phase."""
    if remaining_days < 0:
        return "overdue"
    if remaining_days == 0:
        return "due"
    if warning_days > 0 and remaining_days <= warning_days:
        return "warning"
    return "normal"


@dataclass(slots=True)
class CountdownTask:
    """Persisted cyclic maintenance task."""

    task_id: str
    name: str
    icon: str
    interval_days: int
    last_completed_date: str
    due_date: str
    warning_days: int = DEFAULT_WARNING_DAYS
    notifications_enabled: bool = False
    persistent_notification_enabled: bool = False
    notification_targets: list[str] = field(default_factory=list)
    notification_title: str = ""
    notification_message: str = DEFAULT_NOTIFICATION_MESSAGE
    notify_on_warning: bool = True
    notify_on_due: bool = True
    cycle_id: str = field(default_factory=lambda: str(uuid4()))
    sent_events: list[str] = field(default_factory=list)

    @classmethod
    def create(cls, data: dict[str, Any], today: date) -> CountdownTask:
        """Validate and create a task."""
        validated = validate_task_data(data, partial=False, today=today)
        last = parse_date(validated["last_completed_date"])
        interval = validated["interval_days"]
        return cls(
            task_id=str(uuid4()),
            due_date=calculate_due_date(last, interval).isoformat(),
            cycle_id=str(uuid4()),
            **validated,
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CountdownTask:
        """Restore a task, accepting defaults added by schema migrations."""
        payload = dict(data)
        payload.setdefault("icon", DEFAULT_ICON)
        payload.setdefault("warning_days", DEFAULT_WARNING_DAYS)
        payload.setdefault("notifications_enabled", False)
        payload.setdefault("persistent_notification_enabled", False)
        payload.setdefault("notification_targets", [])
        payload.setdefault("notification_title", "")
        payload.setdefault("notification_message", DEFAULT_NOTIFICATION_MESSAGE)
        payload.setdefault("notify_on_warning", True)
        payload.setdefault("notify_on_due", True)
        payload.setdefault("cycle_id", str(uuid4()))
        payload.setdefault("sent_events", [])
        return cls(**payload)

    def to_dict(self) -> dict[str, Any]:
        """Return a storage/API representation."""
        return asdict(self)

    def runtime(self, today: date) -> dict[str, Any]:
        """Return persisted fields plus calculated runtime state."""
        remaining = calculate_remaining_days(parse_date(self.due_date), today)
        result = self.to_dict()
        result.update(
            remaining_days=remaining,
            elapsed_progress=calculate_elapsed_progress(self.interval_days, remaining),
            phase=calculate_phase(remaining, self.warning_days),
        )
        return result

    def update(self, changes: dict[str, Any], today: date) -> None:
        """Apply validated changes, recalculating due date from the last completion."""
        merged = self.to_dict()
        merged.update(changes)
        validated = validate_task_data(merged, partial=False, today=today)
        for key, value in validated.items():
            setattr(self, key, value)
        self.due_date = calculate_due_date(
            parse_date(self.last_completed_date), self.interval_days
        ).isoformat()

    def complete(self, today: date) -> None:
        """Start a new cycle from the actual completion date."""
        self.last_completed_date = today.isoformat()
        self.due_date = calculate_due_date(today, self.interval_days).isoformat()
        self.cycle_id = str(uuid4())
        self.sent_events = []


def validate_task_data(data: dict[str, Any], *, partial: bool, today: date) -> dict[str, Any]:
    """Validate task input and normalize supported values."""
    allowed = {
        "name",
        "icon",
        "interval_days",
        "last_completed_date",
        "warning_days",
        "notifications_enabled",
        "persistent_notification_enabled",
        "notification_targets",
        "notification_title",
        "notification_message",
        "notify_on_warning",
        "notify_on_due",
    }
    unknown = set(data) - allowed - {"task_id", "due_date", "cycle_id", "sent_events"}
    if unknown:
        raise TaskValidationError(f"Unsupported fields: {', '.join(sorted(unknown))}")

    result: dict[str, Any] = {}
    if not partial or "name" in data:
        name = str(data.get("name", "")).strip()
        if not name or len(name) > 128:
            raise TaskValidationError("name must contain 1 to 128 characters")
        result["name"] = name

    if not partial or "icon" in data:
        icon = str(data.get("icon", DEFAULT_ICON)).strip() or DEFAULT_ICON
        if not ICON_PATTERN.fullmatch(icon) or len(icon) > 128:
            raise TaskValidationError("icon must be a Home Assistant icon identifier")
        result["icon"] = icon

    if not partial or "interval_days" in data:
        try:
            interval = int(data.get("interval_days", 0))
        except (TypeError, ValueError) as err:
            raise TaskValidationError("interval_days must be an integer") from err
        if isinstance(data.get("interval_days"), bool) or not 1 <= interval <= MAX_INTERVAL_DAYS:
            raise TaskValidationError(f"interval_days must be between 1 and {MAX_INTERVAL_DAYS}")
        result["interval_days"] = interval

    if not partial or "last_completed_date" in data:
        value = data.get("last_completed_date", today.isoformat())
        result["last_completed_date"] = parse_date(value).isoformat()

    interval_for_warning = result.get("interval_days", data.get("interval_days"))
    if not partial or "warning_days" in data:
        try:
            warning = int(data.get("warning_days", DEFAULT_WARNING_DAYS))
        except (TypeError, ValueError) as err:
            raise TaskValidationError("warning_days must be an integer") from err
        if isinstance(data.get("warning_days"), bool) or warning < 0:
            raise TaskValidationError("warning_days must be zero or greater")
        if interval_for_warning is not None and warning > int(interval_for_warning):
            raise TaskValidationError("warning_days cannot exceed interval_days")
        result["warning_days"] = warning

    defaults = {
        "notifications_enabled": False,
        "persistent_notification_enabled": False,
        "notification_title": "",
        "notification_message": DEFAULT_NOTIFICATION_MESSAGE,
        "notify_on_warning": True,
        "notify_on_due": True,
    }
    for key, default in defaults.items():
        if not partial or key in data:
            value = data.get(key, default)
            if key in {
                "notifications_enabled",
                "persistent_notification_enabled",
                "notify_on_warning",
                "notify_on_due",
            }:
                value = bool(value)
            else:
                value = str(value).strip()
            result[key] = value

    if not partial or "notification_targets" in data:
        targets = data.get("notification_targets", [])
        if not isinstance(targets, list) or any(not isinstance(item, str) for item in targets):
            raise TaskValidationError("notification_targets must be a list of strings")
        result["notification_targets"] = list(dict.fromkeys(targets))

    enabled = result.get("notifications_enabled", data.get("notifications_enabled", False))
    message = result.get("notification_message", data.get("notification_message", ""))
    if enabled and not str(message).strip():
        raise TaskValidationError("notification_message is required when notifications are enabled")
    return result
