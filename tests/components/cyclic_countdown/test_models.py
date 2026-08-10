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
