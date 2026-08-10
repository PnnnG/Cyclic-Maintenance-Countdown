"""WebSocket API used by the Lovelace visual editor."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .models import CountdownTask, TaskValidationError
from .notifications import async_send_test, list_notification_targets
from .storage import TaskManager

TASK_FIELDS = {
    vol.Optional("name"): str,
    vol.Optional("icon"): str,
    vol.Optional("interval_days"): vol.Any(int, str),
    vol.Optional("last_completed_date"): str,
    vol.Optional("warning_days"): vol.Any(int, str),
    vol.Optional("notifications_enabled"): bool,
    vol.Optional("persistent_notification_enabled"): bool,
    vol.Optional("notification_targets"): [str],
    vol.Optional("notification_title"): str,
    vol.Optional("notification_message"): str,
    vol.Optional("notify_on_warning"): bool,
    vol.Optional("notify_on_due"): bool,
}
TASK_FIELD_NAMES = {
    "name",
    "icon",
    "interval_days",
    "last_completed_date",
    "warning_days",
    "notifications_enabled",
    "persistent_notification_enabled",
    "notification_targets",
    "notification_title",
    "notification_message",
    "notify_on_warning",
    "notify_on_due",
}


def register_websocket_commands(hass: HomeAssistant) -> None:
    """Register all public command handlers once."""
    for command in (
        ws_list_tasks,
        ws_create_task,
        ws_update_task,
        ws_delete_task,
        ws_complete_task,
        ws_list_notification_targets,
        ws_test_notification,
    ):
        websocket_api.async_register_command(hass, command)


def _manager(hass: HomeAssistant) -> TaskManager:
    manager = hass.data.get(DOMAIN)
    if manager is None:
        raise TaskValidationError("Cyclic Countdown integration is not loaded")
    return manager


def _error(connection: websocket_api.ActiveConnection, msg_id: int, err: Exception) -> None:
    code = "not_found" if str(err) == "Task not found" else "invalid_format"
    connection.send_error(msg_id, code, str(err))


@websocket_api.websocket_command({vol.Required("type"): "cyclic_countdown/tasks/list"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list_tasks(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return all tasks with current calendar state."""
    try:
        manager = _manager(hass)
        connection.send_result(
            msg["id"], [task.runtime(manager.today) for task in manager.list_tasks()]
        )
    except TaskValidationError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {vol.Required("type"): "cyclic_countdown/tasks/create", **TASK_FIELDS}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_create_task(hass, connection, msg) -> None:
    """Create a task."""
    try:
        task = await _manager(hass).async_create(_task_payload(msg))
        connection.send_result(msg["id"], task.runtime(_manager(hass).today))
    except TaskValidationError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "cyclic_countdown/tasks/update",
        vol.Required("task_id"): str,
        **TASK_FIELDS,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update_task(hass, connection, msg) -> None:
    """Update a task."""
    try:
        manager = _manager(hass)
        task = await manager.async_update(msg["task_id"], _task_payload(msg))
        connection.send_result(msg["id"], task.runtime(manager.today))
    except TaskValidationError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {vol.Required("type"): "cyclic_countdown/tasks/delete", vol.Required("task_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_task(hass, connection, msg) -> None:
    """Delete a task."""
    try:
        await _manager(hass).async_delete(msg["task_id"])
        connection.send_result(msg["id"])
    except TaskValidationError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {vol.Required("type"): "cyclic_countdown/tasks/complete", vol.Required("task_id"): str}
)
@websocket_api.async_response
async def ws_complete_task(hass, connection, msg) -> None:
    """Complete a task after checking entity control permission."""
    try:
        manager = _manager(hass)
        task_id = msg["task_id"]
        registry = er.async_get(hass)
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{task_id}_countdown")
        if entity_id and not connection.user.permissions.check_entity(entity_id, POLICY_CONTROL):
            raise Unauthorized
        task = await manager.async_complete(task_id)
        connection.send_result(msg["id"], task.runtime(manager.today))
    except TaskValidationError as err:
        _error(connection, msg["id"], err)


@websocket_api.websocket_command(
    {vol.Required("type"): "cyclic_countdown/notification_targets/list"}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list_notification_targets(hass, connection, msg) -> None:
    """Return friendly notification target descriptors."""
    connection.send_result(msg["id"], list_notification_targets(hass))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "cyclic_countdown/notifications/test",
        vol.Optional("task_id"): str,
        **TASK_FIELDS,
        vol.Optional("targets"): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_test_notification(hass, connection, msg) -> None:
    """Send a test notification from the current, possibly unsaved draft."""
    try:
        manager = _manager(hass)
        payload = _task_payload(msg)
        if payload:
            task = CountdownTask.create(payload, manager.today)
            task.task_id = msg.get("task_id", "test")
        else:
            task = manager.get_task(msg.get("task_id", ""))
            if task is None:
                raise TaskValidationError("Task not found")
        connection.send_result(msg["id"], await async_send_test(manager, task, msg.get("targets")))
    except TaskValidationError as err:
        _error(connection, msg["id"], err)


def _task_payload(msg: dict[str, Any]) -> dict[str, Any]:
    return {key: msg[key] for key in TASK_FIELD_NAMES if key in msg}
