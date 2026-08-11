"""Cyclic Maintenance Countdown integration."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_CORE_CONFIG_UPDATE
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.loader import async_get_integration

from .const import (
    DOMAIN,
    PLATFORMS,
    SERVICE_COMPLETE,
)
from .frontend_resource import (
    async_register_lovelace_resource,
    async_remove_lovelace_resource,
    frontend_resource_url,
)
from .models import TaskValidationError
from .notifications import NotificationCoordinator, async_reconcile_notifications
from .storage import TaskManager
from .websocket_api import register_websocket_commands, user_can_complete_task

SERVICE_COMPLETE_SCHEMA = vol.Schema({vol.Required("task_id"): cv.string})
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
_LOGGER = logging.getLogger(__name__)
_NOTIFICATION_COORDINATOR = f"{DOMAIN}_notification_coordinator"


class _NotificationReconciliationWorker:
    """Coalesce notification checks without blocking manager mutations."""

    def __init__(
        self,
        manager: TaskManager,
        coordinator: NotificationCoordinator,
        generation: int,
    ) -> None:
        self._manager = manager
        self._coordinator = coordinator
        self._generation = generation
        self._requested = asyncio.Event()

    @callback
    def request(self) -> None:
        """Request one reconciliation, coalescing repeated requests."""
        self._requested.set()

    @callback
    def task_changed(self, event: str, task_id: str | None) -> None:
        """Schedule checks for persisted task mutations."""
        if event in {"created", "updated", "completed"}:
            self.request()

    async def async_run(self) -> None:
        """Process requested reconciliations until the entry is unloaded."""
        while True:
            await self._requested.wait()
            self._requested.clear()
            try:
                await async_reconcile_notifications(
                    self._manager,
                    coordinator=self._coordinator,
                    generation=self._generation,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                _LOGGER.exception("Cyclic countdown notification reconciliation failed")


async def _async_register_persistent_frontend_resource(hass: HomeAssistant, url: str) -> None:
    """Prefer a persistent card resource and retain a safe fallback."""
    try:
        if await async_register_lovelace_resource(hass, url):
            remove_extra_js_url(hass, url)
            return
    except Exception:  # Extra-module loading remains the fallback.
        _LOGGER.exception("Failed to register the persistent Lovelace card resource")
    add_extra_js_url(hass, url)


async def _async_handle_complete_service(hass: HomeAssistant, call: ServiceCall) -> None:
    """Complete a task after applying service-context authorization."""
    manager: TaskManager | None = hass.data.get(DOMAIN)
    if manager is None:
        raise HomeAssistantError("Cyclic Countdown integration is not loaded")
    task_id = call.data["task_id"]
    if call.context.user_id:
        user = await hass.auth.async_get_user(call.context.user_id)
        if user is None or not user_can_complete_task(hass, user, task_id):
            raise Unauthorized
    try:
        await manager.async_complete(task_id)
    except TaskValidationError as err:
        raise HomeAssistantError(str(err)) from err


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register integration-wide API, action and frontend asset."""
    register_websocket_commands(hass)

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/cyclic_countdown", str(frontend_path), cache_headers=False)]
    )

    async def complete_task(call: ServiceCall) -> None:
        await _async_handle_complete_service(hass, call)

    hass.services.async_register(
        DOMAIN,
        SERVICE_COMPLETE,
        complete_task,
        schema=SERVICE_COMPLETE_SCHEMA,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load the single UI-created config entry."""
    integration = await async_get_integration(hass, DOMAIN)
    await _async_register_persistent_frontend_resource(
        hass,
        frontend_resource_url(integration.version),
    )

    manager = TaskManager(hass)
    await manager.async_load()
    hass.data[DOMAIN] = manager
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    coordinator = hass.data.setdefault(
        _NOTIFICATION_COORDINATOR,
        NotificationCoordinator(),
    )
    generation = await coordinator.async_activate(manager)
    worker = _NotificationReconciliationWorker(manager, coordinator, generation)
    entry.async_create_background_task(
        hass,
        worker.async_run(),
        "cyclic-countdown-notification-reconciliation",
    )

    async def midnight_refresh(now) -> None:
        await manager.async_refresh()
        worker.request()

    entry.async_on_unload(
        async_track_time_change(hass, midnight_refresh, hour=0, minute=0, second=5)
    )

    async def core_config_updated(event) -> None:
        """Re-evaluate immediately after timezone or core date settings change."""
        await manager.async_refresh()
        worker.request()

    entry.async_on_unload(hass.bus.async_listen(EVENT_CORE_CONFIG_UPDATE, core_config_updated))

    entry.async_on_unload(manager.async_add_listener(worker.task_changed))
    entry.async_on_unload(lambda: coordinator.async_deactivate(manager))
    worker.request()
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload sensors and all entry-owned listeners."""
    manager: TaskManager | None = hass.data.get(DOMAIN)
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        coordinator = hass.data.get(_NOTIFICATION_COORDINATOR)
        if manager is not None and isinstance(coordinator, NotificationCoordinator):
            # Finish any marker write before ConfigEntry cancels the worker. This
            # prevents an executor write from the old manager outliving reload.
            await coordinator.async_deactivate(manager)
        if hass.data.get(DOMAIN) is manager:
            hass.data.pop(DOMAIN, None)
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove the entry-owned Lovelace resource on integration deletion."""
    integration = await async_get_integration(hass, DOMAIN)
    resource_url = frontend_resource_url(integration.version)
    try:
        await async_remove_lovelace_resource(hass)
    except Exception:  # Removal must not strand the config entry.
        _LOGGER.exception("Failed to remove the persistent Lovelace card resource")
    remove_extra_js_url(hass, resource_url)
