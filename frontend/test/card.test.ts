import { beforeEach, describe, expect, it, vi } from "vitest";

import "../src/cyclic-countdown-card";
import type { CyclicCountdownCard } from "../src/cyclic-countdown-card";
import type { CardConfig, HomeAssistant } from "../src/models/types";

const config = (overrides: Partial<CardConfig> = {}): CardConfig => ({
  type: "custom:cyclic-countdown-card",
  task_id: "task-1",
  style: "bar",
  reverse_progress: false,
  confirm_complete: true,
  show_secondary: true,
  secondary_info: "due_date",
  tap_action: "complete",
  hold_action: "more-info",
  ...overrides,
});

const hass: HomeAssistant = {
  language: "ru",
  connection: { sendMessagePromise: async () => ({}) as never },
  states: {
    "sensor.filter_countdown": {
      entity_id: "sensor.filter_countdown",
      state: "13",
      attributes: {
        task_id: "task-1",
        name: "Бактерии",
        icon: "mdi:bacteria",
        interval_days: 14,
        last_completed_date: "2026-08-09",
        due_date: "2026-08-23",
        warning_days: 1,
        remaining_days: 13,
        elapsed_progress: 1 / 14,
        phase: "normal",
        notifications_enabled: false,
        notification_targets: [],
        notification_title: "",
        notification_message: "",
        notify_on_warning: true,
        notify_on_due: true,
      },
    },
  },
};

describe("cyclic-countdown-card", () => {
  let card: CyclicCountdownCard;

  beforeEach(() => {
    card = document.createElement("cyclic-countdown-card") as CyclicCountdownCard;
    card.setConfig(config());
    card.hass = hass;
    document.body.replaceChildren(card);
  });

  it("registers itself in the Home Assistant visual card picker", () => {
    expect(window.customCards).toContainEqual(
      expect.objectContaining({
        type: "cyclic-countdown-card",
        name: "Cyclic Maintenance Countdown",
        preview: false,
      }),
    );
  });

  it("registers the element and returns a stub without the card type", () => {
    const cardClass = customElements.get("cyclic-countdown-card") as
      | (CustomElementConstructor & { getStubConfig(): Record<string, unknown> })
      | undefined;
    expect(cardClass).toBeDefined();
    expect(cardClass?.getStubConfig()).not.toHaveProperty("type");
  });

  it("renders a large day count instead of percent", async () => {
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".days strong")?.textContent).toBe("13");
    expect(card.shadowRoot?.querySelector(".content")?.textContent).not.toContain("13%");
  });

  it.each(["bar", "fill"] as const)("renders %s style", async (style) => {
    card.setConfig(config({ style }));
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("ha-card")?.classList.contains(style)).toBe(true);
  });

  it("reverses only visual progress", async () => {
    card.setConfig(config({ reverse_progress: true }));
    await card.updateComplete;
    const element = card.shadowRoot?.querySelector<HTMLElement>("ha-card");
    expect(element?.getAttribute("style")).toContain("--progress:93%");
    expect(card.shadowRoot?.querySelector(".days strong")?.textContent).toBe("13");
  });

  it("renders a clear missing-task state", async () => {
    card.setConfig(config({ task_id: "missing" }));
    await card.updateComplete;
    expect(card.shadowRoot?.textContent).toContain("Задача не найдена");
  });

  it.each([
    ["normal", 8],
    ["warning", 1],
    ["due", 0],
    ["overdue", -3],
  ] as const)("renders explicit %s state", async (phase, remaining) => {
    card.hass = {
      ...hass,
      states: {
        "sensor.filter_countdown": {
          ...hass.states["sensor.filter_countdown"],
          state: String(remaining),
          attributes: {
            ...hass.states["sensor.filter_countdown"].attributes,
            phase,
            remaining_days: remaining,
          },
        },
      },
    };
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".card")?.classList.contains(phase)).toBe(true);
    expect(card.shadowRoot?.querySelector(".days strong")?.textContent).toBe(String(remaining));
  });

  it("blocks double completion while the backend request is pending", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    const request = vi.fn(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    ) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    card.hass = { ...hass, connection: { sendMessagePromise: request } };
    card.setConfig(config({ confirm_complete: false }));
    await card.updateComplete;
    const surface = card.shadowRoot?.querySelector<HTMLElement>(".card");
    surface?.click();
    surface?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledOnce();
    resolveRequest?.(hass.states["sensor.filter_countdown"].attributes);
  });
});
