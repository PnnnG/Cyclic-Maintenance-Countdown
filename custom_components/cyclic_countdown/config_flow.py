"""UI setup flow for Maintenance Countdown."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import CONFIG_ENTRY_VERSION, DEFAULT_INTEGRATION_TITLE, DOMAIN


class CyclicCountdownConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create the single local config entry."""

    VERSION = CONFIG_ENTRY_VERSION

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Confirm installation; tasks are managed from the card editor."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=DEFAULT_INTEGRATION_TITLE, data={})
        return self.async_show_form(step_id="user")
