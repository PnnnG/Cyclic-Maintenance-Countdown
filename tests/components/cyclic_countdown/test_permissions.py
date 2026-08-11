"""Completion permission regression tests."""

from __future__ import annotations

import inspect
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from homeassistant.auth.models import User
from homeassistant.core import Context, HomeAssistant, ServiceCall
from homeassistant.exceptions import Unauthorized

from custom_components.cyclic_countdown import _async_handle_complete_service
from custom_components.cyclic_countdown.const import DOMAIN, SERVICE_COMPLETE
from custom_components.cyclic_countdown.websocket_api import ws_complete_task

TASK_ID = "2f96074a-8a53-4b35-bb80-d8ce560cf888"


class _Task:
    def runtime(self, today: date) -> dict[str, Any]:
        return {"task_id": TASK_ID, "remaining_days": 30}


class _Manager:
    today = date(2026, 8, 12)

    def __init__(self) -> None:
        self.completed: list[str] = []

    async def async_complete(self, task_id: str) -> _Task:
        self.completed.append(task_id)
        return _Task()


def _service_call(hass: HomeAssistant, user: User) -> ServiceCall:
    return ServiceCall(
        hass,
        DOMAIN,
        SERVICE_COMPLETE,
        {"task_id": TASK_ID},
        Context(user_id=user.id),
    )


@pytest.mark.parametrize("transport", ["service", "websocket"])
async def test_non_admin_cannot_complete_when_task_entity_is_missing(
    hass: HomeAssistant,
    hass_read_only_user: User,
    transport: str,
) -> None:
    """A missing registry entry must never bypass a non-admin permission check."""
    manager = _Manager()
    hass.data[DOMAIN] = manager

    with pytest.raises(Unauthorized):
        if transport == "service":
            await _async_handle_complete_service(hass, _service_call(hass, hass_read_only_user))
        else:
            handler = inspect.unwrap(ws_complete_task)
            await handler(
                hass,
                SimpleNamespace(user=hass_read_only_user, send_result=lambda *args: None),
                {"id": 1, "task_id": TASK_ID},
            )

    assert manager.completed == []


@pytest.mark.parametrize("transport", ["service", "websocket"])
async def test_admin_can_complete_when_task_entity_is_missing(
    hass: HomeAssistant,
    hass_admin_user: User,
    transport: str,
) -> None:
    """Admins retain an explicit fallback while a task entity is unavailable."""
    manager = _Manager()
    hass.data[DOMAIN] = manager

    if transport == "service":
        await _async_handle_complete_service(hass, _service_call(hass, hass_admin_user))
    else:
        handler = inspect.unwrap(ws_complete_task)
        await handler(
            hass,
            SimpleNamespace(user=hass_admin_user, send_result=lambda *args: None),
            {"id": 1, "task_id": TASK_ID},
        )

    assert manager.completed == [TASK_ID]
