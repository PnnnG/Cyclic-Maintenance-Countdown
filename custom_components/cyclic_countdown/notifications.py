"""Notification target discovery and cycle-safe delivery."""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant

from .models import CountdownTask, calculate_remaining_days, parse_date
from .storage import TaskManager

_LOGGER = logging.getLogger(__name__)
_PLACEHOLDERS = {"name", "days", "due_date"}


def list_notification_targets(hass: HomeAssistant) -> list[dict[str, Any]]:
    """List modern notify entities and compatible legacy notify actions."""
    targets: list[dict[str, Any]] = []
    for state in sorted(hass.states.async_all("notify"), key=lambda item: item.entity_id):
        targets.append(
            {
                "id": state.entity_id,
                "name": state.attributes.get("friendly_name") or state.name,
                "available": state.state not in {"unavailable", "unknown"},
                "kind": "entity",
            }
        )

    services = hass.services.async_services().get("notify", {})
    ignored = {"send_message", "persistent_notification"}
    for service in sorted(set(services) - ignored):
        target_id = f"notify.{service}"
        if any(item["id"] == target_id for item in targets):
            continue
        targets.append(
            {
                "id": target_id,
                "name": service.replace("_", " ").title(),
                "available": True,
                "kind": "legacy_service",
            }
        )
    return targets


def render_message(template: str, task: CountdownTask, today: date) -> str:
    """Safely substitute the three supported placeholders without Jinja."""
    remaining = calculate_remaining_days(parse_date(task.due_date), today)
    values = {
        "name": task.name,
        "days": str(remaining),
        "due_date": task.due_date,
    }
    result = template
    for key in _PLACEHOLDERS:
        result = result.replace("{" + key + "}", values[key])
    return result


async def async_send_to_targets(
    hass: HomeAssistant,
    targets: list[str],
    message: str,
    title: str = "",
) -> dict[str, list[str]]:
    """Deliver independently so one failed target never blocks the rest."""
    delivered: list[str] = []
    failed: list[str] = []
    data: dict[str, Any] = {"message": message}
    if title:
        data["title"] = title

    async def send(target_id: str) -> None:
        try:
            if target_id.startswith("notify.") and target_id in hass.states.async_entity_ids(
                "notify"
            ):
                await hass.services.async_call(
                    "notify",
                    "send_message",
                    data,
                    target={"entity_id": target_id},
                    blocking=True,
                )
            elif target_id.startswith("notify."):
                await hass.services.async_call(
                    "notify", target_id.split(".", 1)[1], data, blocking=True
                )
            else:
                raise ValueError("Unsupported notification target")
            delivered.append(target_id)
        except Exception as err:
            failed.append(target_id)
            _LOGGER.warning("Notification target %s failed: %s", target_id, type(err).__name__)

    await asyncio.gather(*(send(target) for target in targets))
    return {"delivered": delivered, "failed": failed}


async def async_send_persistent_notification(
    hass: HomeAssistant,
    message: str,
    title: str = "",
    notification_id: str | None = None,
) -> dict[str, list[str]]:
    """Create or update a notification in Home Assistant's notification panel."""
    target_id = "persistent_notification"
    data: dict[str, Any] = {"message": message}
    if title:
        data["title"] = title
    if notification_id:
        data["notification_id"] = notification_id
    try:
        await hass.services.async_call(
            "persistent_notification", "create", data, blocking=True
        )
        return {"delivered": [target_id], "failed": []}
    except Exception as err:
        _LOGGER.warning("Persistent notification failed: %s", type(err).__name__)
        return {"delivered": [], "failed": [target_id]}


async def async_send_task_notification(
    manager: TaskManager,
    task: CountdownTask,
    message: str,
    *,
    event: str,
    targets: list[str] | None = None,
) -> dict[str, list[str]]:
    """Deliver a task event to configured mobile and persistent targets."""
    result = await async_send_to_targets(
        manager.hass,
        targets if targets is not None else task.notification_targets,
        message,
        task.notification_title,
    )
    if task.persistent_notification_enabled:
        persistent = await async_send_persistent_notification(
            manager.hass,
            message,
            task.notification_title,
            f"cyclic_countdown_{task.task_id}_{event}",
        )
        result["delivered"].extend(persistent["delivered"])
        result["failed"].extend(persistent["failed"])
    return result


async def async_reconcile_notifications(manager: TaskManager) -> None:
    """Send each unsent warning/due event once for the current cycle.

    A missed due event is caught up after downtime even if the task is already
    overdue; the marker prevents all subsequent overdue-day repeats.
    """
    today = manager.today
    for task in manager.list_tasks():
        if not task.notifications_enabled or (
            not task.notification_targets and not task.persistent_notification_enabled
        ):
            continue
        remaining = calculate_remaining_days(parse_date(task.due_date), today)
        events: list[str] = []
        if (
            task.notify_on_warning
            and task.warning_days > 0
            and remaining <= task.warning_days
            and not manager.event_was_sent(task, "warning")
        ):
            events.append("warning")
        if task.notify_on_due and remaining <= 0 and not manager.event_was_sent(task, "due"):
            events.append("due")

        for event in events:
            message = render_message(task.notification_message, task, today)
            result = await async_send_task_notification(
                manager, task, message, event=event
            )
            if result["delivered"]:
                await manager.async_mark_event_sent(task.task_id, event)


async def async_send_test(
    manager: TaskManager, task: CountdownTask, targets: list[str] | None = None
) -> dict[str, list[str]]:
    """Send a test notification using current task data."""
    return await async_send_task_notification(
        manager,
        task,
        render_message(task.notification_message, task, manager.today),
        event="test",
        targets=targets,
    )
