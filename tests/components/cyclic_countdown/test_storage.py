"""Storage schema migration tests."""

from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import storage as ha_storage
from homeassistant.util.file import WriteError

from custom_components.cyclic_countdown.storage import (
    CountdownStore,
    PersistenceError,
    TaskManager,
)

_REAL_STORE_ASYNC_WRITE_DATA = ha_storage.Store._async_write_data


class _ControlledStore:
    """Record snapshots and fail writes on demand."""

    def __init__(self) -> None:
        self.fail = False
        self.snapshots: list[dict[str, Any]] = []

    async def async_save(self, data: dict[str, Any]) -> None:
        if self.fail:
            raise OSError("storage unavailable")
        self.snapshots.append(data)


class _LoadStore:
    """Return a controlled storage payload."""

    def __init__(self, data: object) -> None:
        self.data = data

    async def async_load(self) -> object:
        return self.data


def _task_data(name: str = "Filter") -> dict[str, Any]:
    return {
        "name": name,
        "icon": "mdi:air-filter",
        "interval_days": 30,
        "last_completed_date": "2026-08-01",
        "warning_days": 1,
    }


@pytest.mark.asyncio
async def test_schema_one_migrates_notification_fields() -> None:
    store = object.__new__(CountdownStore)
    migrated = await store._async_migrate_func(1, 1, {"tasks": [{"name": "Filter"}]})
    task = migrated["tasks"][0]
    assert task["notification_title"] == ""
    assert task["notify_on_warning"] is True
    assert task["notify_on_due"] is True
    assert task["sent_events"] == []
    assert task["persistent_notification_enabled"] is False


@pytest.mark.asyncio
async def test_schema_two_minor_one_adds_persistent_notification_flag() -> None:
    store = object.__new__(CountdownStore)
    migrated = await store._async_migrate_func(2, 1, {"tasks": [{"name": "Filter"}]})
    assert migrated["tasks"][0]["persistent_notification_enabled"] is False


@pytest.mark.parametrize(
    "stored",
    [None, [], {"tasks": "not-a-list"}],
)
async def test_load_ignores_invalid_storage_roots(
    hass: HomeAssistant,
    stored: object,
) -> None:
    """A corrupt root cannot prevent the integration from loading safely."""
    manager = TaskManager(hass)
    manager._store = _LoadStore(stored)

    await manager.async_load()

    assert manager.list_tasks() == []


async def test_load_skips_only_the_corrupt_task_record(hass: HomeAssistant) -> None:
    """A malformed task is isolated while valid persisted tasks still load."""
    source = TaskManager(hass)
    store = _ControlledStore()
    source._store = store
    valid = await source.async_create(_task_data())
    manager = TaskManager(hass)
    manager._store = _LoadStore({"tasks": [{"task_id": "not-a-uuid"}, valid.to_dict(), "invalid"]})

    await manager.async_load()

    assert [task.task_id for task in manager.list_tasks()] == [valid.task_id]


async def test_load_skips_overflow_record_but_keeps_valid_task(hass: HomeAssistant) -> None:
    """One unrepresentable due date cannot abort the remaining stored tasks."""
    source = TaskManager(hass)
    store = _ControlledStore()
    source._store = store
    valid = await source.async_create(_task_data())
    overflow = valid.to_dict()
    overflow["task_id"] = "00000000-0000-4000-8000-000000000001"
    overflow["last_completed_date"] = "9999-12-31"
    manager = TaskManager(hass)
    manager._store = _LoadStore({"tasks": [overflow, valid.to_dict()]})

    await manager.async_load()

    assert [task.task_id for task in manager.list_tasks()] == [valid.task_id]


async def test_real_store_restores_tasks_after_manager_restart(hass: HomeAssistant) -> None:
    """Persisted tasks survive replacement of the in-memory manager."""
    manager = TaskManager(hass)
    created = await manager.async_create(_task_data())

    restored_manager = TaskManager(hass)
    await restored_manager.async_load()

    restored = restored_manager.get_task(created.task_id)
    assert restored is not None
    assert restored.to_dict() == created.to_dict()


@pytest.mark.parametrize("mutation", ["create", "update", "complete", "delete", "mark"])
async def test_failed_save_leaves_manager_state_unchanged(
    hass: HomeAssistant,
    monkeypatch: pytest.MonkeyPatch,
    mutation: str,
) -> None:
    """A real HA Store write failure cannot leak an in-memory mutation."""
    manager = TaskManager(hass)
    task = await manager.async_create(_task_data())
    before = [item.to_dict() for item in manager.list_tasks()]
    events: list[tuple[str, str | None]] = []
    manager.async_add_listener(lambda event, task_id: events.append((event, task_id)))

    def fail_atomic_write(store: CountdownStore, mode: str, json_data: str | bytes) -> None:
        raise WriteError(OSError("storage unavailable"))

    # The HA test fixture normally replaces Store's writer with an in-memory
    # implementation. Restore the production path so this exercises the
    # exception translation around HA's real serialization/executor writer.
    monkeypatch.setattr(CountdownStore, "_write_prepared_data", fail_atomic_write)

    with (
        patch.object(
            ha_storage.Store,
            "_async_write_data",
            _REAL_STORE_ASYNC_WRITE_DATA,
        ),
        pytest.raises(PersistenceError, match="Failed to persist"),
    ):
        if mutation == "create":
            await manager.async_create(_task_data("Salt"))
        elif mutation == "update":
            await manager.async_update(task.task_id, {"name": "Changed"})
        elif mutation == "complete":
            await manager.async_complete(task.task_id)
        elif mutation == "delete":
            await manager.async_delete(task.task_id)
        else:
            await manager.async_mark_event_sent(
                task.task_id,
                "due",
                expected_cycle_id=task.cycle_id,
            )

    assert [item.to_dict() for item in manager.list_tasks()] == before
    assert events == []


async def test_successful_mutations_commit_saved_state(hass: HomeAssistant) -> None:
    """Copy-on-write mutations expose the same state that was persisted."""
    manager = TaskManager(hass)
    store = _ControlledStore()
    manager._store = store
    task = await manager.async_create(_task_data())

    task = await manager.async_update(task.task_id, {"name": "Changed"})
    original_cycle = task.cycle_id
    task = await manager.async_complete(task.task_id)
    assert task.cycle_id != original_cycle
    await manager.async_mark_event_sent(
        task.task_id,
        "due",
        expected_cycle_id=task.cycle_id,
    )

    stored_task = store.snapshots[-1]["tasks"][0]
    assert stored_task == manager.get_task(task.task_id).to_dict()
    assert stored_task["sent_events"] == [f"{task.cycle_id}:due"]

    await manager.async_delete(task.task_id)
    assert manager.list_tasks() == []
    assert store.snapshots[-1] == {"tasks": []}


async def test_marker_is_not_written_after_cycle_changes(hass: HomeAssistant) -> None:
    """A delayed delivery cannot mark the replacement cycle as already notified."""
    manager = TaskManager(hass)
    store = _ControlledStore()
    manager._store = store
    task = await manager.async_create(_task_data())
    delivered_cycle_id = task.cycle_id
    task = await manager.async_complete(task.task_id)
    saves_before_marker = len(store.snapshots)

    await manager.async_mark_event_sent(
        task.task_id,
        "due",
        expected_cycle_id=delivered_cycle_id,
    )

    assert len(store.snapshots) == saves_before_marker
    assert manager.get_task(task.task_id).sent_events == []


async def test_marker_for_deleted_task_is_a_noop(hass: HomeAssistant) -> None:
    """A delivery finishing after deletion cannot resurrect or fail on the task."""
    manager = TaskManager(hass)
    store = _ControlledStore()
    manager._store = store
    task = await manager.async_create(_task_data())
    await manager.async_delete(task.task_id)
    saves_before_marker = len(store.snapshots)

    await manager.async_mark_event_sent(
        task.task_id,
        "due",
        expected_cycle_id=task.cycle_id,
    )

    assert len(store.snapshots) == saves_before_marker
    assert manager.get_task(task.task_id) is None
