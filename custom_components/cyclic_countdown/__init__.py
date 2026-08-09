"""Cyclic Maintenance Countdown integration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_CORE_CONFIG_UPDATE
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_time_change

from .const import (
    DOMAIN,
    PLATFORMS,
    SERVICE_COMPLETE,
)
from .models import TaskValidationError
from .notifications import async_reconcile_notifications
from .storage import TaskManager
from .websocket_api import register_websocket_commands

SERVICE_COMPLETE_SCHEMA = vol.Schema({vol.Required("task_id"): cv.string})


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register integration-wide API, action and frontend asset."""
    register_websocket_commands(hass)

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/cyclic_countdown", str(frontend_path), cache_headers=True)]
    )

    async def complete_task(call: ServiceCall) -> None:
        manager: TaskManager | None = hass.data.get(DOMAIN)
        if manager is None:
            raise HomeAssistantError("Cyclic Countdown integration is not loaded")
        task_id = call.data["task_id"]
        if call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            entity_id = er.async_get(hass).async_get_entity_id(
                "sensor", DOMAIN, f"{task_id}_countdown"
            )
            if user is None or (
                entity_id and not user.permissions.check_entity(entity_id, POLICY_CONTROL)
            ):
                raise Unauthorized
        try:
            await manager.async_complete(task_id)
        except TaskValidationError as err:
            raise HomeAssistantError(str(err)) from err

    hass.services.async_register(
        DOMAIN,
        SERVICE_COMPLETE,
        complete_task,
        schema=SERVICE_COMPLETE_SCHEMA,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load the single UI-created config entry."""
    manager = TaskManager(hass)
    await manager.async_load()
    hass.data[DOMAIN] = manager
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def midnight_refresh(now) -> None:
        await manager.async_refresh()
        await async_reconcile_notifications(manager)

    entry.async_on_unload(
        async_track_time_change(hass, midnight_refresh, hour=0, minute=0, second=5)
    )

    async def core_config_updated(event) -> None:
        """Re-evaluate immediately after timezone or core date settings change."""
        await manager.async_refresh()
        await async_reconcile_notifications(manager)

    entry.async_on_unload(hass.bus.async_listen(EVENT_CORE_CONFIG_UPDATE, core_config_updated))

    async def manager_changed(event: str, task_id: str | None) -> None:
        if event in {"created", "updated", "completed"}:
            await async_reconcile_notifications(manager)

    entry.async_on_unload(manager.async_add_listener(manager_changed))
    await async_reconcile_notifications(manager)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload sensors and all entry-owned listeners."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data.pop(DOMAIN, None)
    return unloaded
