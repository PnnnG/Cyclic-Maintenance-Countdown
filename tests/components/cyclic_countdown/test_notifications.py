"""Safe notification rendering and event marker tests."""

from datetime import date
from types import SimpleNamespace

import pytest

from custom_components.cyclic_countdown import notifications
from custom_components.cyclic_countdown.models import CountdownTask
from custom_components.cyclic_countdown.notifications import render_message


def test_only_safe_placeholders_are_substituted() -> None:
    task = CountdownTask.create(
        {
            "name": "Salt",
            "icon": "mdi:shaker-outline",
            "interval_days": 30,
            "last_completed_date": "2026-08-01",
            "warning_days": 2,
        },
        date(2026, 8, 1),
    )
    message = render_message(
        "{name}: {days}, {due_date}; {{ states('sensor.secret') }}", task, date(2026, 8, 10)
    )
    assert message == "Salt: 21, 2026-08-31; {{ states('sensor.secret') }}"


@pytest.mark.asyncio
async def test_reconciliation_does_not_duplicate_cycle_events(monkeypatch) -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 14,
            "last_completed_date": "2026-07-01",
            "warning_days": 1,
            "notifications_enabled": True,
            "notification_targets": ["notify.phone"],
            "notification_message": "{name}: {days}",
            "notify_on_warning": True,
            "notify_on_due": True,
        },
        date(2026, 7, 1),
    )
    markers: set[str] = set()

    class FakeManager:
        today = date(2026, 8, 10)
        hass = SimpleNamespace()

        def list_tasks(self):
            return [task]

        def event_was_sent(self, current_task, event):
            return event in markers

        async def async_mark_event_sent(self, task_id, event):
            markers.add(event)

    sent: list[str] = []

    async def fake_send(hass, targets, message, title):
        sent.append(message)
        return {"delivered": list(targets), "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", fake_send)
    manager = FakeManager()
    await notifications.async_reconcile_notifications(manager)
    await notifications.async_reconcile_notifications(manager)

    assert markers == {"warning", "due"}
    assert len(sent) == 2


@pytest.mark.asyncio
async def test_persistent_notification_works_without_mobile_targets(monkeypatch) -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 14,
            "last_completed_date": "2026-07-01",
            "warning_days": 1,
            "notifications_enabled": True,
            "persistent_notification_enabled": True,
            "notification_targets": [],
            "notification_message": "{name}: {days}",
            "notify_on_warning": False,
            "notify_on_due": True,
        },
        date(2026, 7, 1),
    )
    markers: set[str] = set()

    class FakeManager:
        today = date(2026, 8, 10)
        hass = SimpleNamespace()

        def list_tasks(self):
            return [task]

        def event_was_sent(self, current_task, event):
            return event in markers

        async def async_mark_event_sent(self, task_id, event):
            markers.add(event)

    sent_ids: list[str] = []

    async def fake_targets(hass, targets, message, title):
        assert targets == []
        return {"delivered": [], "failed": []}

    async def fake_persistent(hass, message, title, notification_id):
        sent_ids.append(notification_id)
        return {"delivered": ["persistent_notification"], "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", fake_targets)
    monkeypatch.setattr(
        notifications, "async_send_persistent_notification", fake_persistent
    )

    await notifications.async_reconcile_notifications(FakeManager())

    assert markers == {"due"}
    assert sent_ids == [f"cyclic_countdown_{task.task_id}_due"]
