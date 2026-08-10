"""Storage schema migration tests."""

import pytest

from custom_components.cyclic_countdown.storage import CountdownStore


@pytest.mark.asyncio
async def test_schema_one_migrates_notification_fields() -> None:
    store = object.__new__(CountdownStore)
    migrated = await store._async_migrate_func(1, 1, {"tasks": [{"name": "Filter"}]})
    task = migrated["tasks"][0]
    assert task["notification_title"] == ""
    assert task["notify_on_warning"] is True
    assert task["notify_on_due"] is True
    assert task["sent_events"] == []
    assert task["persistent_notification_enabled"] is False


@pytest.mark.asyncio
async def test_schema_two_minor_one_adds_persistent_notification_flag() -> None:
    store = object.__new__(CountdownStore)
    migrated = await store._async_migrate_func(2, 1, {"tasks": [{"name": "Filter"}]})
    assert migrated["tasks"][0]["persistent_notification_enabled"] is False
