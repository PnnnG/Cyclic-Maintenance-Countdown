"""Config flow and frontend registration tests."""

import pytest
from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.cyclic_countdown.const import DOMAIN, FRONTEND_URL


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_user_flow_creates_loaded_integration(hass: HomeAssistant) -> None:
    """The UI flow creates an integration entry and loads its card module."""
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
    assert FRONTEND_URL in hass.data[DATA_EXTRA_MODULE_URL].urls


@pytest.mark.usefixtures("enable_custom_integrations")
async def test_second_user_flow_is_aborted(hass: HomeAssistant) -> None:
    """Only one integration entry can be configured."""
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
