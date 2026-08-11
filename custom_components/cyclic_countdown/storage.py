"""Persistent task manager for Cyclic Maintenance Countdown."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import storage
from homeassistant.util import dt as dt_util
from homeassistant.util import json as json_util
from homeassistant.util.file import WriteError

from .const import (
    EVENT_COMPLETED,
    EVENT_CREATED,
    EVENT_DELETED,
    EVENT_REFRESHED,
    EVENT_UPDATED,
    STORAGE_KEY,
    STORAGE_MINOR_VERSION,
    STORAGE_VERSION,
)
from .models import CountdownTask, TaskValidationError

_LOGGER = logging.getLogger(__name__)

TaskListener = Callable[[str, str | None], Awaitable[None] | None]


class PersistenceError(RuntimeError):
    """Raised when task state cannot be persisted."""


class CountdownStore(storage.Store[dict[str, Any]]):
    """Versioned storage with migrations from the initial task schema."""

    async def _async_write_data(self, data: dict[str, Any]) -> None:
        """Preserve HA's atomic writer while surfacing failures to the manager.

        ``Store.async_save`` deliberately defers writes while Home Assistant is
        stopping. During normal runtime this translation prevents Store's
        best-effort error logging from being mistaken for a committed write.
        """
        try:
            await super()._async_write_data(data)
        except (json_util.SerializationError, WriteError) as err:
            raise PersistenceError("Failed to persist cyclic countdown tasks") from err

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        """Migrate persisted task data."""
        if not isinstance(old_data, dict):
            _LOGGER.error("Discarding invalid cyclic countdown storage root")
            return {"tasks": []}

        data = dict(old_data)
        stored_tasks = data.get("tasks", [])
        if not isinstance(stored_tasks, list):
            _LOGGER.error("Discarding invalid cyclic countdown task collection")
            stored_tasks = []
        tasks = [dict(task) for task in stored_tasks if isinstance(task, dict)]
        if len(tasks) != len(stored_tasks):
            _LOGGER.error("Skipping non-object records in cyclic countdown storage")
        if old_major_version < 2:
            for task in tasks:
                task.setdefault("notification_title", "")
                task.setdefault("notify_on_warning", True)
                task.setdefault("notify_on_due", True)
                task.setdefault("sent_events", [])
        if old_major_version < 2 or old_minor_version < 2:
            for task in tasks:
                task.setdefault("persistent_notification_enabled", False)
        data["tasks"] = tasks
        return data


class TaskManager:
    """Own task state, persistence and atomic mutations."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = CountdownStore(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY,
            minor_version=STORAGE_MINOR_VERSION,
            atomic_writes=True,
        )
        self._tasks: dict[str, CountdownTask] = {}
        self._lock = asyncio.Lock()
        self._listeners: set[TaskListener] = set()

    @property
    def today(self) -> date:
        """Return Home Assistant's local calendar date."""
        return dt_util.now().date()

    async def async_load(self) -> None:
        """Load tasks after Home Assistant storage is ready."""
        data = await self._store.async_load()
        if data is None:
            return
        if not isinstance(data, dict) or not isinstance(data.get("tasks", []), list):
            _LOGGER.error("Ignoring invalid cyclic countdown storage data")
            return
        for raw_task in data.get("tasks", []):
            if not isinstance(raw_task, dict):
                _LOGGER.error("Skipping non-object cyclic countdown task record")
                continue
            try:
                task = CountdownTask.from_dict(raw_task)
            except (TypeError, ValueError) as err:
                _LOGGER.error("Skipping invalid persisted cyclic task: %s", err)
                continue
            self._tasks[task.task_id] = task

    def list_tasks(self) -> list[CountdownTask]:
        """Return tasks sorted by display name."""
        return sorted(self._tasks.values(), key=lambda task: task.name.casefold())

    def get_task(self, task_id: str) -> CountdownTask | None:
        """Return a task by UUID."""
        return self._tasks.get(task_id)

    def runtime_task(self, task_id: str) -> dict[str, Any] | None:
        """Return API-ready task state."""
        task = self.get_task(task_id)
        return task.runtime(self.today) if task else None

    async def async_create(self, data: dict[str, Any]) -> CountdownTask:
        """Create and persist a task."""
        async with self._lock:
            task = CountdownTask.create(data, self.today)
            next_tasks = dict(self._tasks)
            next_tasks[task.task_id] = task
            await self._async_save(next_tasks)
            self._tasks = next_tasks
        await self._async_notify(EVENT_CREATED, task.task_id)
        return task

    async def async_update(self, task_id: str, changes: dict[str, Any]) -> CountdownTask:
        """Update and persist a task."""
        async with self._lock:
            task = CountdownTask.from_dict(self._require_task(task_id).to_dict())
            task.update(changes, self.today)
            next_tasks = dict(self._tasks)
            next_tasks[task_id] = task
            await self._async_save(next_tasks)
            self._tasks = next_tasks
        await self._async_notify(EVENT_UPDATED, task_id)
        return task

    async def async_complete(self, task_id: str) -> CountdownTask:
        """Atomically complete a task from today's actual date."""
        async with self._lock:
            task = CountdownTask.from_dict(self._require_task(task_id).to_dict())
            task.complete(self.today)
            next_tasks = dict(self._tasks)
            next_tasks[task_id] = task
            await self._async_save(next_tasks)
            self._tasks = next_tasks
        await self._async_notify(EVENT_COMPLETED, task_id)
        return task

    async def async_delete(self, task_id: str) -> None:
        """Delete and persist a task."""
        async with self._lock:
            self._require_task(task_id)
            next_tasks = dict(self._tasks)
            del next_tasks[task_id]
            await self._async_save(next_tasks)
            self._tasks = next_tasks
        await self._async_notify(EVENT_DELETED, task_id)

    async def async_mark_event_sent(
        self,
        task_id: str,
        event: str,
        *,
        expected_cycle_id: str,
    ) -> bool:
        """Persist a marker only for the cycle whose notification was delivered."""
        async with self._lock:
            current = self._tasks.get(task_id)
            if current is None:
                return False
            if current.cycle_id != expected_cycle_id:
                return False
            task = CountdownTask.from_dict(current.to_dict())
            marker = f"{task.cycle_id}:{event}"
            if marker in task.sent_events:
                return True
            task.sent_events.append(marker)
            next_tasks = dict(self._tasks)
            next_tasks[task_id] = task
            await self._async_save(next_tasks)
            self._tasks = next_tasks
            return True

    def event_was_sent(self, task: CountdownTask, event: str) -> bool:
        """Return whether event was sent for the current cycle."""
        return f"{task.cycle_id}:{event}" in task.sent_events

    async def async_refresh(self) -> None:
        """Notify entities that local calendar-derived values may have changed."""
        await self._async_notify(EVENT_REFRESHED, None)

    @callback
    def async_add_listener(self, listener: TaskListener) -> Callable[[], None]:
        """Subscribe to task changes."""
        self._listeners.add(listener)

        @callback
        def remove_listener() -> None:
            self._listeners.discard(listener)

        return remove_listener

    async def _async_save(self, tasks: dict[str, CountdownTask]) -> None:
        await self._store.async_save({"tasks": [task.to_dict() for task in tasks.values()]})

    async def _async_notify(self, event: str, task_id: str | None) -> None:
        for listener in tuple(self._listeners):
            try:
                result = listener(event, task_id)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                _LOGGER.exception("Cyclic countdown listener failed")

    def _require_task(self, task_id: str) -> CountdownTask:
        task = self._tasks.get(task_id)
        if task is None:
            raise TaskValidationError("Task not found")
        return task
