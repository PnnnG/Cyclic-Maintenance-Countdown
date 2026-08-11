"""Calendar model tests independent from Home Assistant runtime scheduling."""

from datetime import date

import pytest

from custom_components.cyclic_countdown.models import (
    CountdownTask,
    TaskValidationError,
    calculate_elapsed_progress,
    calculate_phase,
    calculate_remaining_days,
    parse_date,
)


@pytest.mark.parametrize(
    ("due", "today", "expected"),
    [
        ("2026-08-23", "2026-08-10", 13),
        ("2026-08-10", "2026-08-10", 0),
        ("2026-08-09", "2026-08-10", -1),
    ],
)
def test_remaining_days(due: str, today: str, expected: int) -> None:
    assert calculate_remaining_days(parse_date(due), parse_date(today)) == expected


@pytest.mark.parametrize(
    ("remaining", "warning", "phase"),
    [(5, 1, "normal"), (1, 1, "warning"), (0, 1, "due"), (-4, 1, "overdue")],
)
def test_explicit_phase_model(remaining: int, warning: int, phase: str) -> None:
    assert calculate_phase(remaining, warning) == phase


def test_warning_zero_disables_warning_phase() -> None:
    assert calculate_phase(1, 0) == "normal"


def test_progress_is_clamped() -> None:
    assert calculate_elapsed_progress(14, 14) == 0
    assert calculate_elapsed_progress(14, 0) == 1
    assert calculate_elapsed_progress(14, -10) == 1


def test_overdue_completion_starts_from_actual_date() -> None:
    task = CountdownTask.create(
        {
            "name": "Bacteria",
            "icon": "mdi:bacteria",
            "interval_days": 14,
            "last_completed_date": "2026-07-01",
            "warning_days": 1,
        },
        date(2026, 7, 1),
    )
    old_cycle = task.cycle_id
    task.complete(date(2026, 8, 10))
    assert task.last_completed_date == "2026-08-10"
    assert task.due_date == "2026-08-24"
    assert task.cycle_id != old_cycle
    assert task.sent_events == []


def test_interval_update_keeps_last_completed_date() -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 1,
        },
        date(2026, 8, 1),
    )
    task.update({"interval_days": 60}, date(2026, 8, 10))
    assert task.last_completed_date == "2026-08-01"
    assert task.due_date == "2026-09-30"


def test_create_rejects_due_date_overflow() -> None:
    """A valid ISO boundary date cannot escape as a raw OverflowError."""
    with pytest.raises(TaskValidationError, match="supported calendar range"):
        CountdownTask.create(
            {
                "name": "Boundary",
                "icon": "mdi:calendar-alert",
                "interval_days": 1,
                "last_completed_date": "9999-12-31",
                "warning_days": 0,
            },
            date(2026, 8, 12),
        )


def test_update_rejects_due_date_overflow() -> None:
    """Editing a task to an unrepresentable due date is a validation error."""
    task = CountdownTask.create(
        {
            "name": "Boundary",
            "icon": "mdi:calendar-alert",
            "interval_days": 1,
            "last_completed_date": "2026-08-01",
            "warning_days": 0,
        },
        date(2026, 8, 12),
    )
    before = task.to_dict()

    with pytest.raises(TaskValidationError, match="supported calendar range"):
        task.update({"last_completed_date": "9999-12-31"}, date(2026, 8, 12))
    assert task.to_dict() == before


def test_from_dict_rejects_due_date_overflow() -> None:
    """A boundary-date storage record is isolated as invalid data."""
    task = CountdownTask.create(
        {
            "name": "Boundary",
            "icon": "mdi:calendar-alert",
            "interval_days": 1,
            "last_completed_date": "2026-08-01",
            "warning_days": 0,
        },
        date(2026, 8, 12),
    )
    stored = task.to_dict()
    stored["last_completed_date"] = "9999-12-31"

    with pytest.raises(TaskValidationError, match="supported calendar range"):
        CountdownTask.from_dict(stored)


@pytest.mark.parametrize(
    "changes",
    [
        {"interval_days": 60},
        {"last_completed_date": "2026-08-03"},
    ],
)
def test_rescheduling_cycle_clears_stale_notification_markers(changes) -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 1,
        },
        date(2026, 8, 1),
    )
    old_cycle = task.cycle_id
    task.sent_events = [f"{old_cycle}:warning", f"{old_cycle}:due"]

    task.update(changes, date(2026, 8, 10))

    assert task.cycle_id != old_cycle
    assert task.sent_events == []


def test_non_scheduling_update_preserves_notification_cycle() -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 1,
        },
        date(2026, 8, 1),
    )
    cycle = task.cycle_id
    task.sent_events = [f"{cycle}:warning"]

    task.update({"name": "Kitchen filter"}, date(2026, 8, 10))

    assert task.cycle_id == cycle
    assert task.sent_events == [f"{cycle}:warning"]


@pytest.mark.parametrize("stored_due", ["not-a-date", "2099-01-01", None])
def test_from_dict_repairs_derived_due_date(stored_due) -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 1,
        },
        date(2026, 8, 1),
    )
    stored = task.to_dict()
    if stored_due is None:
        stored.pop("due_date")
    else:
        stored["due_date"] = stored_due

    restored = CountdownTask.from_dict(stored)

    assert restored.due_date == "2026-08-31"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("task_id", "not-a-uuid"),
        ("cycle_id", "not-a-uuid"),
        ("interval_days", "30"),
        ("notifications_enabled", "false"),
        ("sent_events", ["wrong-cycle:due"]),
    ],
)
def test_from_dict_rejects_corrupted_persisted_fields(field, value) -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 1,
        },
        date(2026, 8, 1),
    )
    stored = task.to_dict()
    stored[field] = value

    with pytest.raises(TaskValidationError):
        CountdownTask.from_dict(stored)


def test_home_assistant_custom_icon_identifier_is_accepted() -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "custom_icons:air-filter",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 1,
        },
        date(2026, 8, 1),
    )
    assert task.icon == "custom_icons:air-filter"


@pytest.mark.parametrize("icon", ["bacteria", "mdi:", "mdi:bad icon", "MDI:bacteria"])
def test_invalid_icon_identifier_is_rejected(icon: str) -> None:
    with pytest.raises(TaskValidationError):
        CountdownTask.create(
            {
                "name": "Invalid icon",
                "icon": icon,
                "interval_days": 30,
                "last_completed_date": "2026-08-01",
                "warning_days": 1,
            },
            date(2026, 8, 1),
        )


@pytest.mark.parametrize("interval", [0, -1, 3651, True])
def test_invalid_interval_rejected(interval) -> None:
    with pytest.raises(TaskValidationError):
        CountdownTask.create(
            {
                "name": "Invalid",
                "icon": "mdi:alert",
                "interval_days": interval,
                "last_completed_date": "2026-08-10",
                "warning_days": 0,
            },
            date(2026, 8, 10),
        )
