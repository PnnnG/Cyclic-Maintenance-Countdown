"""Persistent Lovelace resource management for the bundled card."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlsplit

from homeassistant.components.lovelace.const import LOVELACE_DATA
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant

from .const import FRONTEND_PATH

_LOGGER = logging.getLogger(__name__)


def frontend_resource_url(version: str) -> str:
    """Return the cache-busted URL shared by both frontend loading paths."""
    return f"{FRONTEND_PATH}?v={version}"


def _is_our_resource(item: dict[str, Any]) -> bool:
    """Return whether a Lovelace resource points at our bundled module."""
    parsed = urlsplit(str(item.get("url", "")))
    return not parsed.scheme and not parsed.netloc and parsed.path == FRONTEND_PATH


async def async_register_lovelace_resource(hass: HomeAssistant, url: str) -> bool:
    """Create or update the bundled card's persistent Lovelace resource.

    YAML resource collections are intentionally left untouched. In that mode
    the integration-wide extra-module registration remains the supported
    fallback.
    """
    lovelace = hass.data.get(LOVELACE_DATA)
    resources = getattr(lovelace, "resources", None)
    if not isinstance(resources, ResourceStorageCollection):
        return False

    # Home Assistant 2026.7+ lazy-loads this collection, preserving resources
    # created by the user and other integrations before we write our item.
    await resources.async_get_info()
    items = list(resources.async_items())

    matching = [item for item in items if _is_our_resource(item)]
    if matching:
        resource = next(
            (item for item in matching if item.get("url") == url and item.get("type") == "module"),
            matching[0],
        )
        if resource.get("url") != url or resource.get("type") != "module":
            resource = await resources.async_update_item(
                resource["id"],
                {"res_type": "module", "url": url},
            )
        for duplicate in matching:
            if duplicate["id"] != resource["id"]:
                _LOGGER.warning(
                    "Removing duplicate Cyclic Maintenance Countdown Lovelace resource %s",
                    duplicate["id"],
                )
                await resources.async_delete_item(duplicate["id"])
        return True

    await resources.async_create_item({"res_type": "module", "url": url})
    return True


async def async_remove_lovelace_resource(hass: HomeAssistant) -> bool:
    """Remove only persistent resources in this integration's URL namespace."""
    lovelace = hass.data.get(LOVELACE_DATA)
    resources = getattr(lovelace, "resources", None)
    if not isinstance(resources, ResourceStorageCollection):
        return False

    await resources.async_get_info()
    matching = [item for item in resources.async_items() if _is_our_resource(item)]
    for resource in matching:
        await resources.async_delete_item(resource["id"])
    return bool(matching)
