"""Config flow and frontend registration tests."""

from types import SimpleNamespace

import pytest
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.resources import (
    ResourceStorageCollection,
    ResourceYAMLCollection,
)
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.loader import async_get_integration
from pytest_homeassistant_custom_component.common import mock_component

from custom_components.cyclic_countdown.const import DOMAIN
from custom_components.cyclic_countdown.frontend_resource import frontend_resource_url


class _FrontendModuleURLs:
    """Minimal frontend URL manager for the backend-only test package."""

    def __init__(self) -> None:
        self.urls: set[str] = set()

    def add(self, url: str) -> None:
        self.urls.add(url)

    def remove(self, url: str) -> None:
        self.urls.discard(url)


class _StorageResources(ResourceStorageCollection):
    """Minimal persistent Lovelace collection for integration setup."""

    def __init__(self) -> None:
        self.items: list[dict] = []

    async def async_get_info(self) -> dict[str, int]:
        return {"resources": len(self.items)}

    def async_items(self) -> list[dict]:
        return self.items

    async def async_create_item(self, data: dict) -> dict:
        item = {"id": "resource-1", "type": data["res_type"], "url": data["url"]}
        self.items.append(item)
        return item

    async def async_update_item(self, item_id: str, updates: dict) -> dict:
        item = next(item for item in self.items if item["id"] == item_id)
        item.update({"type": updates["res_type"], "url": updates["url"]})
        return item

    async def async_delete_item(self, item_id: str) -> None:
        self.items = [item for item in self.items if item["id"] != item_id]


class _FailingStorageResources(_StorageResources):
    """Storage collection that fails before any mutation."""

    async def async_get_info(self) -> dict[str, int]:
        raise RuntimeError("storage unavailable")


def _mock_frontend_assets(
    hass: HomeAssistant,
    resources: ResourceStorageCollection | ResourceYAMLCollection | None = None,
) -> ResourceStorageCollection | ResourceYAMLCollection:
    """Mark frontend loaded without requiring the separately packaged UI assets."""
    hass.data[DATA_EXTRA_MODULE_URL] = _FrontendModuleURLs()
    resources = resources or _StorageResources()
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)
    mock_component(hass, "frontend")
    mock_component(hass, "lovelace")
    return resources


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_user_flow_creates_loaded_integration(hass: HomeAssistant) -> None:
    """The UI flow creates an integration entry and loads its card module."""
    resources = _mock_frontend_assets(hass)
    assert isinstance(resources, _StorageResources)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Cyclic Maintenance Countdown"

    await hass.async_block_till_done()
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1
    assert DOMAIN in hass.data
    integration = await async_get_integration(hass, DOMAIN)
    assert resources.items == [
        {
            "id": "resource-1",
            "type": "module",
            "url": frontend_resource_url(integration.version),
        }
    ]
    assert hass.data[DATA_EXTRA_MODULE_URL].urls == set()


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_resource_survives_unload_and_is_removed_with_entry(
    hass: HomeAssistant,
) -> None:
    """Normal reloads retain the card resource; entry removal cleans it up."""
    resources = _mock_frontend_assets(hass)
    assert isinstance(resources, _StorageResources)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert len(resources.items) == 1
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert len(resources.items) == 1

    await hass.config_entries.async_remove(entry.entry_id)
    assert resources.items == []
    assert hass.config_entries.async_entries(DOMAIN) == []

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()
    assert len(resources.items) == 1


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_second_user_flow_is_aborted(hass: HomeAssistant) -> None:
    """Only one integration entry can be configured."""
    _mock_frontend_assets(hass)
    first = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    await hass.config_entries.flow.async_configure(first["flow_id"], {})
    await hass.async_block_till_done()

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


@pytest.mark.usefixtures("enable_custom_integrations")
@pytest.mark.parametrize(
    "resources",
    [ResourceYAMLCollection([]), _FailingStorageResources()],
)
async def test_extra_module_fallback_keeps_card_available(
    hass: HomeAssistant,
    resources: ResourceStorageCollection | ResourceYAMLCollection,
) -> None:
    """YAML mode and storage failure retain the supported extra-module path."""
    _mock_frontend_assets(hass, resources)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY

    await hass.async_block_till_done()
    integration = await async_get_integration(hass, DOMAIN)
    assert frontend_resource_url(integration.version) in hass.data[DATA_EXTRA_MODULE_URL].urls


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_storage_recovery_replaces_extra_module_fallback(
    hass: HomeAssistant,
) -> None:
    """A successful reload removes the temporary extra-module fallback."""
    _mock_frontend_assets(hass, _FailingStorageResources())
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    integration = await async_get_integration(hass, DOMAIN)
    resource_url = frontend_resource_url(integration.version)
    assert resource_url in hass.data[DATA_EXTRA_MODULE_URL].urls

    resources = _StorageResources()
    hass.data[LOVELACE_DATA].resources = resources
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert len(resources.items) == 1
    assert hass.data[DATA_EXTRA_MODULE_URL].urls == set()
