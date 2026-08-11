"""Lifecycle and backpressure tests for notification reconciliation."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import Any

from homeassistant.core import HomeAssistant

from custom_components import cyclic_countdown as integration
from custom_components.cyclic_countdown.notifications import NotificationCoordinator
from custom_components.cyclic_countdown.storage import TaskManager


def _task_data() -> dict[str, Any]:
    return {
        "name": "Filter",
        "icon": "mdi:air-filter",
        "interval_days": 30,
        "last_completed_date": "2026-08-01",
        "warning_days": 1,
    }


async def test_worker_coalesces_requests(
    hass: HomeAssistant,
    monkeypatch,
) -> None:
    """Repeated triggers during a run produce only one follow-up run."""
    manager = TaskManager(hass)
    coordinator = NotificationCoordinator()
    generation = await coordinator.async_activate(manager)
    worker = integration._NotificationReconciliationWorker(
        manager,
        coordinator,
        generation,
    )
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    second_finished = asyncio.Event()
    calls = 0

    async def controlled_reconcile(*args, **kwargs) -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            first_started.set()
            await release_first.wait()
        else:
            second_finished.set()

    monkeypatch.setattr(integration, "async_reconcile_notifications", controlled_reconcile)
    run_task = asyncio.create_task(worker.async_run())
    try:
        worker.request()
        await first_started.wait()
        for _ in range(10):
            worker.request()
        release_first.set()
        await second_finished.wait()
        await asyncio.sleep(0)
        assert calls == 2
    finally:
        run_task.cancel()
        with suppress(asyncio.CancelledError):
            await run_task


async def test_manager_mutations_do_not_wait_for_slow_reconciliation(
    hass: HomeAssistant,
    monkeypatch,
) -> None:
    """Create, update and complete return while notification I/O is stuck."""
    manager = TaskManager(hass)
    coordinator = NotificationCoordinator()
    generation = await coordinator.async_activate(manager)
    worker = integration._NotificationReconciliationWorker(
        manager,
        coordinator,
        generation,
    )
    reconcile_started = asyncio.Event()
    release_reconcile = asyncio.Event()

    async def slow_reconcile(*args, **kwargs) -> None:
        reconcile_started.set()
        await release_reconcile.wait()

    monkeypatch.setattr(integration, "async_reconcile_notifications", slow_reconcile)
    manager.async_add_listener(worker.task_changed)
    run_task = asyncio.create_task(worker.async_run())
    try:
        task = await asyncio.wait_for(manager.async_create(_task_data()), 0.2)
        await reconcile_started.wait()
        task = await asyncio.wait_for(
            manager.async_update(task.task_id, {"name": "Fine filter"}),
            0.2,
        )
        await asyncio.wait_for(manager.async_complete(task.task_id), 0.2)
    finally:
        release_reconcile.set()
        run_task.cancel()
        with suppress(asyncio.CancelledError):
            await run_task
