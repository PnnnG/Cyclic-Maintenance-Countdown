"""Safe notification rendering and event marker tests."""

import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from custom_components.cyclic_countdown import notifications
from custom_components.cyclic_countdown.models import CountdownTask
from custom_components.cyclic_countdown.notifications import (
    async_send_to_targets,
    render_message,
)
from custom_components.cyclic_countdown.storage import TaskManager


def test_notification_targets_hide_only_proven_mobile_app_duplicates(monkeypatch) -> None:
    states = [
        SimpleNamespace(
            entity_id="notify.ipad",
            attributes={"friendly_name": "iPad"},
            name="iPad",
            state="unknown",
        ),
        SimpleNamespace(
            entity_id="notify.external",
            attributes={"friendly_name": "External"},
            name="External",
            state="on",
        ),
        SimpleNamespace(
            entity_id="notify.offline",
            attributes={"friendly_name": "Offline"},
            name="Offline",
            state="unavailable",
        ),
    ]
    entries = {
        "notify.ipad": SimpleNamespace(platform="mobile_app", config_entry_id="mobile-entry"),
        "notify.external": SimpleNamespace(
            platform="third_party", config_entry_id="external-entry"
        ),
    }
    registry = SimpleNamespace(async_get=lambda entity_id: entries.get(entity_id))
    monkeypatch.setattr(notifications.er, "async_get", lambda hass: registry)

    hass = SimpleNamespace(
        states=SimpleNamespace(async_all=lambda domain: states),
        services=SimpleNamespace(
            async_services=lambda: {
                "notify": {
                    "send_message": object(),
                    "persistent_notification": object(),
                    "mobile_app_ipad": object(),
                    "notify": object(),
                    "slack": object(),
                }
            }
        ),
        config_entries=SimpleNamespace(
            async_get_entry=lambda entry_id: (
                SimpleNamespace(data={"device_name": "iPad"})
                if entry_id == "mobile-entry"
                else SimpleNamespace(data={})
            )
        ),
    )

    targets = notifications.list_notification_targets(hass)
    target_ids = {target["id"] for target in targets}

    assert "notify.ipad" in target_ids
    assert "notify.external" in target_ids
    assert "notify.mobile_app_ipad" not in target_ids
    assert "notify.notify" in target_ids
    assert "notify.slack" in target_ids
    ipad = next(target for target in targets if target["id"] == "notify.ipad")
    assert ipad["available"] is True
    offline = next(target for target in targets if target["id"] == "notify.offline")
    assert offline["available"] is False


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
async def test_notification_target_timeout_is_isolated(monkeypatch) -> None:
    """A stuck endpoint becomes failed instead of hanging reconciliation."""
    never = asyncio.Event()

    async def async_call(*args, **kwargs) -> None:
        await never.wait()

    hass = SimpleNamespace(
        states=SimpleNamespace(async_entity_ids=lambda domain: ["notify.phone"]),
        services=SimpleNamespace(async_call=async_call),
    )
    monkeypatch.setattr(notifications, "NOTIFICATION_SEND_TIMEOUT", 0.01)

    result = await notifications.async_send_to_targets(
        hass,
        ["notify.phone"],
        "Test",
    )

    assert result == {"delivered": [], "failed": ["notify.phone"]}


@pytest.mark.asyncio
async def test_reload_reservation_prevents_duplicate_and_stale_snapshot(
    hass,
    monkeypatch,
) -> None:
    """Old/new managers share one delivery and only the new snapshot is saved."""
    old_manager = TaskManager(hass)
    task = await old_manager.async_create(
        {
            "name": "Old name",
            "icon": "mdi:air-filter",
            "interval_days": 14,
            "last_completed_date": (old_manager.today - timedelta(days=14)).isoformat(),
            "warning_days": 1,
            "notifications_enabled": True,
            "notification_targets": ["notify.phone"],
            "notification_message": "{name}: {days}",
            "notify_on_warning": False,
            "notify_on_due": True,
        }
    )
    coordinator = notifications.NotificationCoordinator()
    old_generation = await coordinator.async_activate(old_manager)
    send_started = asyncio.Event()
    release_send = asyncio.Event()
    sent: list[str] = []

    async def delayed_send(hass, targets, message, title):
        sent.append(message)
        send_started.set()
        await release_send.wait()
        return {"delivered": list(targets), "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", delayed_send)
    old_reconcile = asyncio.create_task(
        notifications.async_reconcile_notifications(
            old_manager,
            coordinator=coordinator,
            generation=old_generation,
        )
    )
    await send_started.wait()

    await coordinator.async_deactivate(old_manager)
    new_manager = TaskManager(hass)
    await new_manager.async_load()
    await new_manager.async_update(task.task_id, {"name": "New name"})
    new_generation = await coordinator.async_activate(new_manager)
    new_reconcile = asyncio.create_task(
        notifications.async_reconcile_notifications(
            new_manager,
            coordinator=coordinator,
            generation=new_generation,
        )
    )
    await asyncio.sleep(0)
    assert len(sent) == 1

    release_send.set()
    await asyncio.gather(old_reconcile, new_reconcile)

    current = new_manager.get_task(task.task_id)
    assert current is not None
    assert current.name == "New name"
    assert current.sent_events == [f"{task.cycle_id}:due"]
    assert len(sent) == 1

    restarted_manager = TaskManager(hass)
    await restarted_manager.async_load()
    restored = restarted_manager.get_task(task.task_id)
    assert restored is not None
    assert restored.name == "New name"
    assert restored.sent_events == [f"{task.cycle_id}:due"]


@pytest.mark.asyncio
async def test_partial_target_failure_keeps_successful_delivery() -> None:
    """One broken notify action must not cancel another target's delivery."""
    calls: list[str] = []

    async def async_call(domain, service, data, *, blocking, **kwargs):
        assert domain == "notify"
        assert data == {"message": "Replace filter", "title": "Maintenance"}
        assert blocking is True
        calls.append(service)
        if service == "broken":
            raise RuntimeError("target unavailable")

    hass = SimpleNamespace(
        states=SimpleNamespace(async_entity_ids=lambda domain: []),
        services=SimpleNamespace(async_call=async_call),
    )

    result = await async_send_to_targets(
        hass,
        ["notify.working", "notify.broken"],
        "Replace filter",
        "Maintenance",
    )

    assert set(calls) == {"working", "broken"}
    assert result == {
        "delivered": ["notify.working"],
        "failed": ["notify.broken"],
    }


@pytest.mark.asyncio
async def test_all_failed_delivery_does_not_mark_event(monkeypatch) -> None:
    """A due event remains retryable when every configured target fails."""
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 14,
            "last_completed_date": "2026-07-01",
            "warning_days": 1,
            "notifications_enabled": True,
            "notification_targets": ["notify.phone", "notify.tablet"],
            "notification_message": "{name}: {days}",
            "notify_on_warning": False,
            "notify_on_due": True,
        },
        date(2026, 7, 1),
    )
    markers: set[str] = set()
    attempts = 0

    class FakeManager:
        today = date(2026, 8, 10)
        hass = SimpleNamespace()

        def list_tasks(self):
            return [task]

        def event_was_sent(self, current_task, event):
            return event in markers

        async def async_mark_event_sent(self, task_id, event, *, expected_cycle_id):
            if task.cycle_id == expected_cycle_id:
                markers.add(event)

    async def fail_all_targets(hass, targets, message, title):
        nonlocal attempts
        attempts += 1
        return {"delivered": [], "failed": list(targets)}

    monkeypatch.setattr(notifications, "async_send_to_targets", fail_all_targets)
    manager = FakeManager()

    await notifications.async_reconcile_notifications(manager)
    await notifications.async_reconcile_notifications(manager)

    assert attempts == 2
    assert markers == set()


@pytest.mark.asyncio
async def test_overdue_reconciliation_sends_only_current_due_event_once(monkeypatch) -> None:
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

        async def async_mark_event_sent(self, task_id, event, *, expected_cycle_id):
            if task.cycle_id == expected_cycle_id:
                markers.add(event)

    sent: list[str] = []

    async def fake_send(hass, targets, message, title):
        sent.append(message)
        return {"delivered": list(targets), "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", fake_send)
    manager = FakeManager()
    await notifications.async_reconcile_notifications(manager)
    await notifications.async_reconcile_notifications(manager)

    assert markers == {"due"}
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_reconciliation_sends_warning_inside_warning_window(monkeypatch) -> None:
    task = CountdownTask.create(
        {
            "name": "Filter",
            "icon": "mdi:air-filter",
            "interval_days": 14,
            "last_completed_date": "2026-07-28",
            "warning_days": 1,
            "notifications_enabled": True,
            "notification_targets": ["notify.phone"],
            "notification_message": "{name}: {days}",
            "notify_on_warning": True,
            "notify_on_due": True,
        },
        date(2026, 7, 28),
    )
    markers: set[str] = set()

    class FakeManager:
        today = date(2026, 8, 10)
        hass = SimpleNamespace()

        def list_tasks(self):
            return [task]

        def event_was_sent(self, current_task, event):
            return event in markers

        async def async_mark_event_sent(self, task_id, event, *, expected_cycle_id):
            if task.cycle_id == expected_cycle_id:
                markers.add(event)

    sent: list[str] = []

    async def fake_send(hass, targets, message, title):
        sent.append(message)
        return {"delivered": list(targets), "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", fake_send)
    await notifications.async_reconcile_notifications(FakeManager())

    assert markers == {"warning"}
    assert sent == ["Filter: 1"]


@pytest.mark.asyncio
async def test_concurrent_reconciliation_sends_event_once(monkeypatch) -> None:
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

        async def async_mark_event_sent(self, task_id, event, *, expected_cycle_id):
            if task.cycle_id == expected_cycle_id:
                markers.add(event)

    send_started = asyncio.Event()
    release_send = asyncio.Event()
    sent: list[str] = []

    async def delayed_send(hass, targets, message, title):
        sent.append(message)
        send_started.set()
        await release_send.wait()
        return {"delivered": list(targets), "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", delayed_send)
    manager = FakeManager()
    first = asyncio.create_task(notifications.async_reconcile_notifications(manager))
    await send_started.wait()
    second = asyncio.create_task(notifications.async_reconcile_notifications(manager))
    await asyncio.sleep(0)

    assert len(sent) == 1
    release_send.set()
    await asyncio.gather(first, second)

    assert sent == ["Filter: -26"]
    assert markers == {"due"}


@pytest.mark.asyncio
async def test_delivery_does_not_mark_a_replaced_notification_cycle(monkeypatch) -> None:
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
            "notify_on_warning": False,
            "notify_on_due": True,
        },
        date(2026, 7, 1),
    )
    delivered_cycle = task.cycle_id
    marked: list[tuple[str, str]] = []

    class FakeManager:
        today = date(2026, 8, 10)
        hass = SimpleNamespace()

        def list_tasks(self):
            return [task]

        def event_was_sent(self, current_task, event):
            return False

        async def async_mark_event_sent(self, task_id, event, *, expected_cycle_id):
            if task.cycle_id == expected_cycle_id:
                marked.append((expected_cycle_id, event))

    async def complete_during_delivery(hass, targets, message, title):
        task.complete(date(2026, 8, 10))
        return {"delivered": list(targets), "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", complete_during_delivery)
    await notifications.async_reconcile_notifications(FakeManager())

    assert task.cycle_id != delivered_cycle
    assert task.sent_events == []
    assert marked == []


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

        async def async_mark_event_sent(self, task_id, event, *, expected_cycle_id):
            if task.cycle_id == expected_cycle_id:
                markers.add(event)

    sent_ids: list[str] = []

    async def fake_targets(hass, targets, message, title):
        assert targets == []
        return {"delivered": [], "failed": []}

    async def fake_persistent(hass, message, title, notification_id):
        sent_ids.append(notification_id)
        return {"delivered": ["persistent_notification"], "failed": []}

    monkeypatch.setattr(notifications, "async_send_to_targets", fake_targets)
    monkeypatch.setattr(notifications, "async_send_persistent_notification", fake_persistent)

    await notifications.async_reconcile_notifications(FakeManager())

    assert markers == {"due"}
    assert sent_ids == [f"cyclic_countdown_{task.task_id}_due"]
