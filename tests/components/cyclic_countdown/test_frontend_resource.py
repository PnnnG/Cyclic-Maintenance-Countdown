"""Persistent frontend resource lifecycle tests."""

from types import SimpleNamespace
from typing import Any

import pytest
from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.resources import (
    ResourceStorageCollection,
    ResourceYAMLCollection,
)
from homeassistant.core import HomeAssistant

from custom_components.cyclic_countdown.const import FRONTEND_PATH
from custom_components.cyclic_countdown.frontend_resource import (
    async_register_lovelace_resource,
    async_remove_lovelace_resource,
    frontend_resource_url,
)


class _StorageResources(ResourceStorageCollection):
    """Small in-memory implementation preserving the HA collection contract."""

    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items = [dict(item) for item in items or []]
        self.created = 0
        self.updated: list[str] = []
        self.deleted: list[str] = []

    async def async_get_info(self) -> dict[str, int]:
        return {"resources": len(self.items)}

    def async_items(self) -> list[dict[str, Any]]:
        return self.items

    async def async_create_item(self, data: dict) -> dict:
        self.created += 1
        item = {
            "id": f"created-{self.created}",
            "type": data["res_type"],
            "url": data["url"],
        }
        self.items.append(item)
        return item

    async def async_update_item(self, item_id: str, updates: dict) -> dict:
        self.updated.append(item_id)
        item = next(item for item in self.items if item["id"] == item_id)
        item.update(
            {
                "type": updates.get("res_type", item["type"]),
                "url": updates.get("url", item["url"]),
            }
        )
        return item

    async def async_delete_item(self, item_id: str) -> None:
        self.deleted.append(item_id)
        self.items = [item for item in self.items if item["id"] != item_id]


def _set_resources(
    hass: HomeAssistant,
    resources: ResourceStorageCollection | ResourceYAMLCollection,
) -> None:
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)


@pytest.mark.asyncio
async def test_storage_registration_is_idempotent(hass: HomeAssistant) -> None:
    resources = _StorageResources()
    _set_resources(hass, resources)
    url = frontend_resource_url("0.2.5")

    assert await async_register_lovelace_resource(hass, url)
    assert await async_register_lovelace_resource(hass, url)

    assert resources.items == [{"id": "created-1", "type": "module", "url": url}]
    assert resources.created == 1
    assert resources.updated == []


@pytest.mark.asyncio
async def test_storage_registration_updates_version_and_removes_duplicates(
    hass: HomeAssistant,
) -> None:
    resources = _StorageResources(
        [
            {
                "id": "old",
                "type": "js",
                "url": f"{FRONTEND_PATH}?v=0.2.4",
            },
            {
                "id": "duplicate",
                "type": "module",
                "url": FRONTEND_PATH,
            },
            {"id": "foreign", "type": "module", "url": "/local/other.js"},
        ]
    )
    _set_resources(hass, resources)
    url = frontend_resource_url("0.2.5")

    assert await async_register_lovelace_resource(hass, url)

    assert resources.items == [
        {"id": "old", "type": "module", "url": url},
        {"id": "foreign", "type": "module", "url": "/local/other.js"},
    ]
    assert resources.updated == ["old"]
    assert resources.deleted == ["duplicate"]


@pytest.mark.asyncio
async def test_absolute_and_similar_urls_are_not_owned(hass: HomeAssistant) -> None:
    resources = _StorageResources(
        [
            {
                "id": "absolute",
                "type": "module",
                "url": f"https://example.com{FRONTEND_PATH}",
            },
            {
                "id": "suffix",
                "type": "module",
                "url": f"{FRONTEND_PATH}.backup",
            },
        ]
    )
    _set_resources(hass, resources)

    assert await async_register_lovelace_resource(hass, frontend_resource_url("0.2.5"))

    assert [item["id"] for item in resources.items] == [
        "absolute",
        "suffix",
        "created-1",
    ]


@pytest.mark.asyncio
async def test_yaml_resources_are_left_untouched(hass: HomeAssistant) -> None:
    resources = ResourceYAMLCollection([{"type": "module", "url": "/local/user-owned.js"}])
    _set_resources(hass, resources)

    assert not await async_register_lovelace_resource(hass, frontend_resource_url("0.2.5"))
    assert resources.async_items() == [{"type": "module", "url": "/local/user-owned.js"}]


@pytest.mark.asyncio
async def test_remove_deletes_only_owned_resources(hass: HomeAssistant) -> None:
    resources = _StorageResources(
        [
            {"id": "ours", "type": "module", "url": FRONTEND_PATH},
            {
                "id": "ours-versioned",
                "type": "module",
                "url": frontend_resource_url("0.2.4"),
            },
            {"id": "foreign", "type": "module", "url": "/local/other.js"},
        ]
    )
    _set_resources(hass, resources)

    assert await async_remove_lovelace_resource(hass)

    assert resources.items == [{"id": "foreign", "type": "module", "url": "/local/other.js"}]
    assert resources.deleted == ["ours", "ours-versioned"]
