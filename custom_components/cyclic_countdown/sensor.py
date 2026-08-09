"""Sensor entities for cyclic countdown tasks."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import DOMAIN, EVENT_CREATED, EVENT_DELETED
from .storage import TaskManager


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Create sensors and keep them synchronized with dynamic tasks."""
    manager: TaskManager = hass.data[DOMAIN]
    entities: dict[str, CountdownSensor] = {}

    def add_task(task_id: str) -> None:
        if task_id in entities or manager.get_task(task_id) is None:
            return
        entity = CountdownSensor(manager, task_id)
        entities[task_id] = entity
        async_add_entities([entity])

    for task in manager.list_tasks():
        add_task(task.task_id)

    async def task_changed(event: str, task_id: str | None) -> None:
        if event == EVENT_CREATED and task_id:
            add_task(task_id)
            return
        if event == EVENT_DELETED and task_id:
            entity = entities.pop(task_id, None)
            if entity is not None:
                entity_id = entity.entity_id
                await entity.async_remove(force_remove=True)
                if entity_id:
                    registry = async_get_entity_registry(hass)
                    if registry.async_get(entity_id):
                        registry.async_remove(entity_id)
            return
        for entity in tuple(entities.values()):
            if task_id is None or entity.task_id == task_id:
                entity.refresh()

    entry.async_on_unload(manager.async_add_listener(task_changed))


class CountdownSensor(SensorEntity):
    """Calendar-day countdown sensor."""

    _attr_should_poll = False
    _attr_native_unit_of_measurement = UnitOfTime.DAYS
    _attr_suggested_display_precision = 0

    def __init__(self, manager: TaskManager, task_id: str) -> None:
        self.manager = manager
        self.task_id = task_id
        self._attr_unique_id = f"{task_id}_countdown"
        self.refresh(write=False)

    @property
    def available(self) -> bool:
        return self.manager.get_task(self.task_id) is not None

    def refresh(self, *, write: bool = True) -> None:
        """Refresh all calculated and user-visible attributes."""
        runtime = self.manager.runtime_task(self.task_id)
        if runtime:
            self._attr_name = runtime["name"]
            self._attr_icon = runtime["icon"]
            self._attr_native_value = runtime["remaining_days"]
            # Notification contents, targets and delivery markers are intentionally
            # kept out of the state machine; only the admin WebSocket editor sees them.
            public_keys = {
                "task_id",
                "name",
                "icon",
                "interval_days",
                "last_completed_date",
                "due_date",
                "remaining_days",
                "elapsed_progress",
                "phase",
                "warning_days",
            }
            self._attr_extra_state_attributes = {key: runtime[key] for key in public_keys}
        if write and self.hass is not None:
            self.async_write_ha_state()
