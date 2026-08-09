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


class CountdownStore(storage.Store[dict[str, Any]]):
    """Versioned storage with migrations from the initial task schema."""

    async def _async_migrate_func(
        self, old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
    ) -> dict[str, Any]:
        """Migrate persisted task data."""
        data = dict(old_data or {})
        tasks = data.get("tasks", [])
        if old_major_version < 2:
            for task in tasks:
                task.setdefault("notification_title", "")
                task.setdefault("notify_on_warning", True)
                task.setdefault("notify_on_due", True)
                task.setdefault("sent_events", [])
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
        data = await self._store.async_load() or {"tasks": []}
        for raw_task in data.get("tasks", []):
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
            self._tasks[task.task_id] = task
            await self._async_save()
        await self._async_notify(EVENT_CREATED, task.task_id)
        return task

    async def async_update(self, task_id: str, changes: dict[str, Any]) -> CountdownTask:
        """Update and persist a task."""
        async with self._lock:
            task = self._require_task(task_id)
            task.update(changes, self.today)
            await self._async_save()
        await self._async_notify(EVENT_UPDATED, task_id)
        return task

    async def async_complete(self, task_id: str) -> CountdownTask:
        """Atomically complete a task from today's actual date."""
        async with self._lock:
            task = self._require_task(task_id)
            task.complete(self.today)
            await self._async_save()
        await self._async_notify(EVENT_COMPLETED, task_id)
        return task

    async def async_delete(self, task_id: str) -> None:
        """Delete and persist a task."""
        async with self._lock:
            self._require_task(task_id)
            del self._tasks[task_id]
            await self._async_save()
        await self._async_notify(EVENT_DELETED, task_id)

    async def async_mark_event_sent(self, task_id: str, event: str) -> None:
        """Persist notification idempotency marker."""
        async with self._lock:
            task = self._require_task(task_id)
            marker = f"{task.cycle_id}:{event}"
            if marker in task.sent_events:
                return
            task.sent_events.append(marker)
            await self._async_save()

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

    async def _async_save(self) -> None:
        await self._store.async_save({"tasks": [task.to_dict() for task in self._tasks.values()]})

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
