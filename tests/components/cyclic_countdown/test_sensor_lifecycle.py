"""Home Assistant integration tests for dynamic countdown sensors."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from homeassistant.auth.permissions.const import CAT_ENTITIES, POLICY_CONTROL, POLICY_READ
from homeassistant.auth.permissions.entities import ENTITY_ENTITY_IDS
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.resources import ResourceYAMLCollection
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import (
    CLIENT_ID,
    MockConfigEntry,
    MockUser,
    mock_component,
)

from custom_components import cyclic_countdown as integration
from custom_components.cyclic_countdown.const import DOMAIN, SERVICE_COMPLETE
from custom_components.cyclic_countdown.storage import TaskManager


class _FrontendModuleURLs:
    """Minimal URL manager when the separately packaged HA frontend is absent."""

    def __init__(self) -> None:
        self.urls: set[str] = set()

    def add(self, url: str) -> None:
        self.urls.add(url)

    def remove(self, url: str) -> None:
        self.urls.discard(url)


async def _setup_loaded_entry(hass: HomeAssistant) -> tuple[MockConfigEntry, TaskManager]:
    """Load the real config entry and sensor platform with HA-managed dependencies."""
    # hass_frontend is a separately distributed package and is intentionally absent
    # from the backend-only test environment. Only these unrelated UI dependencies
    # are stubbed; the config entry, integration and sensor platform are loaded by HA.
    hass.data[DATA_EXTRA_MODULE_URL] = _FrontendModuleURLs()
    hass.data[LOVELACE_DATA] = SimpleNamespace(
        resources=ResourceYAMLCollection([]),
    )
    mock_component(hass, "frontend")
    mock_component(hass, "lovelace")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Cyclic Maintenance Countdown",
        unique_id=DOMAIN,
        data={},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, hass.data[DOMAIN]


async def _create_task_with_sensor(
    hass: HomeAssistant,
    manager: TaskManager,
) -> tuple[str, str]:
    """Create a task and return its id and HA-managed sensor entity id."""
    task = await manager.async_create(
        {
            "name": "Kitchen filter",
            "interval_days": 14,
            "last_completed_date": (manager.today - timedelta(days=3)).isoformat(),
        }
    )
    await hass.async_block_till_done()
    entity_id = er.async_get(hass).async_get_entity_id(
        "sensor",
        DOMAIN,
        f"{task.task_id}_countdown",
    )
    assert entity_id is not None
    return task.task_id, entity_id


def _grant_entity_control(user: MockUser, entity_id: str) -> None:
    """Give a non-admin test user explicit control over one task entity."""
    user.mock_policy(
        {
            CAT_ENTITIES: {
                ENTITY_ENTITY_IDS: {
                    entity_id: {
                        POLICY_READ: True,
                        POLICY_CONTROL: True,
                    }
                }
            }
        }
    )


async def _access_token_for_user(hass: HomeAssistant, user: MockUser) -> str:
    """Create an authenticated WebSocket token for an explicit test user."""
    refresh_token = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    return hass.auth.async_create_access_token(refresh_token)


async def _ws_request(client, message: dict) -> dict:
    """Send one Home Assistant WebSocket command and receive its response."""
    await client.send_json_auto_id(message)
    return await client.receive_json()


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_dynamic_sensor_lifecycle_and_registry_cleanup(hass: HomeAssistant) -> None:
    """Create, refresh, complete and delete a real sensor entity."""
    _, manager = await _setup_loaded_entry(hass)
    last_completed = manager.today - timedelta(days=3)
    task = await manager.async_create(
        {
            "name": "Kitchen filter",
            "icon": "mdi:air-filter",
            "interval_days": 14,
            "last_completed_date": last_completed.isoformat(),
            "warning_days": 1,
        }
    )
    await hass.async_block_till_done()

    registry = er.async_get(hass)
    unique_id = f"{task.task_id}_countdown"
    entity_id = registry.async_get_entity_id("sensor", DOMAIN, unique_id)
    assert entity_id is not None
    assert registry.async_get(entity_id) is not None

    state = hass.states.get(entity_id)
    assert state is not None
    assert state.state == "11"
    assert state.attributes["task_id"] == task.task_id
    assert state.attributes["due_date"] == (last_completed + timedelta(days=14)).isoformat()
    assert state.attributes["phase"] == "normal"

    task = await manager.async_update(
        task.task_id,
        {
            "name": "Fine filter",
            "icon": "mdi:water-filter",
            "interval_days": 7,
        },
    )
    await hass.async_block_till_done()

    state = hass.states.get(entity_id)
    assert state is not None
    assert state.state == "4"
    assert state.attributes["name"] == "Fine filter"
    assert state.attributes["icon"] == "mdi:water-filter"
    assert state.attributes["interval_days"] == 7
    assert registry.async_get_entity_id("sensor", DOMAIN, unique_id) == entity_id

    task = await manager.async_complete(task.task_id)
    await hass.async_block_till_done()

    state = hass.states.get(entity_id)
    assert state is not None
    assert state.state == "7"
    assert state.attributes["last_completed_date"] == manager.today.isoformat()
    assert state.attributes["due_date"] == (manager.today + timedelta(days=7)).isoformat()

    await manager.async_delete(task.task_id)
    await hass.async_block_till_done()

    assert hass.states.get(entity_id) is None
    assert registry.async_get(entity_id) is None
    assert registry.async_get_entity_id("sensor", DOMAIN, unique_id) is None


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_complete_service_uses_real_entity_permissions(
    hass: HomeAssistant,
    hass_read_only_user: MockUser,
) -> None:
    """The registered service denies and allows users through entity permissions."""
    _, manager = await _setup_loaded_entry(hass)
    task_id, entity_id = await _create_task_with_sensor(hass, manager)
    original_cycle = manager.get_task(task_id).cycle_id

    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_COMPLETE,
            {"task_id": task_id},
            blocking=True,
            context=Context(user_id=hass_read_only_user.id),
        )
    assert manager.get_task(task_id).cycle_id == original_cycle

    controller = MockUser().add_to_hass(hass)
    _grant_entity_control(controller, entity_id)
    await hass.services.async_call(
        DOMAIN,
        SERVICE_COMPLETE,
        {"task_id": task_id},
        blocking=True,
        context=Context(user_id=controller.id),
    )

    completed = manager.get_task(task_id)
    assert completed is not None
    assert completed.cycle_id != original_cycle
    assert completed.last_completed_date == manager.today.isoformat()


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_complete_websocket_uses_real_entity_permissions(
    hass: HomeAssistant,
    hass_read_only_access_token: str,
    hass_ws_client,
) -> None:
    """The registered WebSocket command enforces the same entity policy."""
    _, manager = await _setup_loaded_entry(hass)
    task_id, entity_id = await _create_task_with_sensor(hass, manager)
    original_cycle = manager.get_task(task_id).cycle_id

    denied_client = await hass_ws_client(hass, hass_read_only_access_token)
    await denied_client.send_json_auto_id(
        {
            "type": "cyclic_countdown/tasks/complete",
            "task_id": task_id,
        }
    )
    denied = await denied_client.receive_json()
    await denied_client.close()
    assert denied["success"] is False
    assert denied["error"]["code"] == "unauthorized"
    assert manager.get_task(task_id).cycle_id == original_cycle

    controller = MockUser().add_to_hass(hass)
    _grant_entity_control(controller, entity_id)
    refresh_token = await hass.auth.async_create_refresh_token(controller, CLIENT_ID)
    access_token = hass.auth.async_create_access_token(refresh_token)
    allowed_client = await hass_ws_client(hass, access_token)
    await allowed_client.send_json_auto_id(
        {
            "type": "cyclic_countdown/tasks/complete",
            "task_id": task_id,
        }
    )
    allowed = await allowed_client.receive_json()
    await allowed_client.close()

    assert allowed["success"] is True
    assert allowed["result"]["task_id"] == task_id
    completed = manager.get_task(task_id)
    assert completed is not None
    assert completed.cycle_id != original_cycle
    assert completed.last_completed_date == manager.today.isoformat()


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_admin_websocket_task_crud_uses_registered_handlers(
    hass: HomeAssistant,
    hass_admin_user: MockUser,
    hass_ws_client,
) -> None:
    """An admin can create, list, update and delete through the real WS API."""
    _, manager = await _setup_loaded_entry(hass)
    token = await _access_token_for_user(hass, hass_admin_user)
    client = await hass_ws_client(hass, token)

    try:
        listed = await _ws_request(client, {"type": "cyclic_countdown/tasks/list"})
        assert listed["success"] is True
        assert listed["result"] == []

        created = await _ws_request(
            client,
            {
                "type": "cyclic_countdown/tasks/create",
                "name": "Kitchen filter",
                "icon": "mdi:air-filter",
                "interval_days": 30,
                "last_completed_date": manager.today.isoformat(),
                "warning_days": 2,
            },
        )
        assert created["success"] is True
        task_id = created["result"]["task_id"]
        assert created["result"]["name"] == "Kitchen filter"
        assert created["result"]["remaining_days"] == 30

        listed = await _ws_request(client, {"type": "cyclic_countdown/tasks/list"})
        assert listed["success"] is True
        assert [item["task_id"] for item in listed["result"]] == [task_id]

        updated = await _ws_request(
            client,
            {
                "type": "cyclic_countdown/tasks/update",
                "task_id": task_id,
                "name": "Fine filter",
                "interval_days": 7,
            },
        )
        assert updated["success"] is True
        assert updated["result"]["name"] == "Fine filter"
        assert updated["result"]["interval_days"] == 7
        assert updated["result"]["remaining_days"] == 7

        deleted = await _ws_request(
            client,
            {"type": "cyclic_countdown/tasks/delete", "task_id": task_id},
        )
        assert deleted["success"] is True
        assert manager.get_task(task_id) is None

        listed = await _ws_request(client, {"type": "cyclic_countdown/tasks/list"})
        assert listed["success"] is True
        assert listed["result"] == []
    finally:
        await client.close()


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_admin_websocket_rejects_semantically_invalid_task_payload(
    hass: HomeAssistant,
    hass_admin_user: MockUser,
    hass_ws_client,
) -> None:
    """Model validation is surfaced as a stable WebSocket format error."""
    _, manager = await _setup_loaded_entry(hass)
    token = await _access_token_for_user(hass, hass_admin_user)
    client = await hass_ws_client(hass, token)

    try:
        response = await _ws_request(
            client,
            {
                "type": "cyclic_countdown/tasks/create",
                "name": "Invalid filter",
                "icon": "mdi:air-filter",
                "interval_days": 0,
                "last_completed_date": manager.today.isoformat(),
                "warning_days": 0,
            },
        )
    finally:
        await client.close()

    assert response["success"] is False
    assert response["error"]["code"] == "invalid_format"
    assert manager.list_tasks() == []


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_non_admin_websocket_management_commands_are_denied(
    hass: HomeAssistant,
    hass_read_only_access_token: str,
    hass_ws_client,
) -> None:
    """Every task and notification management command fails closed for non-admins."""
    _, manager = await _setup_loaded_entry(hass)
    task = await manager.async_create(
        {
            "name": "Protected filter",
            "interval_days": 14,
            "last_completed_date": manager.today.isoformat(),
        }
    )
    client = await hass_ws_client(hass, hass_read_only_access_token)
    messages = [
        {"type": "cyclic_countdown/tasks/list"},
        {
            "type": "cyclic_countdown/tasks/create",
            "name": "Unauthorized task",
            "interval_days": 7,
            "last_completed_date": manager.today.isoformat(),
        },
        {
            "type": "cyclic_countdown/tasks/update",
            "task_id": task.task_id,
            "name": "Unauthorized update",
        },
        {"type": "cyclic_countdown/tasks/delete", "task_id": task.task_id},
        {"type": "cyclic_countdown/notification_targets/list"},
        {"type": "cyclic_countdown/notifications/test", "task_id": task.task_id},
    ]

    try:
        for message in messages:
            response = await _ws_request(client, message)
            assert response["success"] is False, message["type"]
            assert response["error"]["code"] == "unauthorized", message["type"]
    finally:
        await client.close()

    assert [item.task_id for item in manager.list_tasks()] == [task.task_id]
    assert manager.get_task(task.task_id).name == "Protected filter"


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_notification_worker_is_cancelled_on_entry_unload(
    hass: HomeAssistant,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Setup never awaits reconciliation and unload cancels its worker."""
    reconcile_started = asyncio.Event()
    reconcile_cancelled = asyncio.Event()

    async def blocked_reconcile(*args, **kwargs) -> None:
        reconcile_started.set()
        try:
            await asyncio.Event().wait()
        finally:
            reconcile_cancelled.set()

    monkeypatch.setattr(integration, "async_reconcile_notifications", blocked_reconcile)

    entry, _ = await asyncio.wait_for(_setup_loaded_entry(hass), 0.5)
    await asyncio.wait_for(reconcile_started.wait(), 0.5)
    assert entry.state.name == "LOADED"

    assert await hass.config_entries.async_unload(entry.entry_id)
    await asyncio.wait_for(reconcile_cancelled.wait(), 0.5)
