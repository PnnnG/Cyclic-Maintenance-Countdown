import { beforeEach, describe, expect, it, vi } from "vitest";

import "../src/cyclic-countdown-card";
import {
  registerCardPickerEntry,
  type CyclicCountdownCard,
} from "../src/cyclic-countdown-card";
import type { CardConfig, HomeAssistant } from "../src/models/types";

const config = (overrides: Partial<CardConfig> = {}): CardConfig => ({
  type: "custom:cyclic-countdown-card",
  task_id: "task-1",
  style: "bar",
  vertical_size: "standard",
  reverse_progress: false,
  confirm_complete: true,
  show_secondary: true,
  secondary_info: "due_date",
  tap_action: "complete",
  hold_action: "more-info",
  double_tap_action: "none",
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
        persistent_notification_enabled: false,
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

  it("refreshes stale picker metadata left by an older loaded version", () => {
    const stale = {
      type: "cyclic-countdown-card",
      name: "Циклическое обслуживание",
      preview: true,
    };
    window.customCards = [stale];

    registerCardPickerEntry();

    expect(window.customCards).toHaveLength(1);
    expect(stale).toEqual(expect.objectContaining({
      name: "Cyclic Maintenance Countdown",
      preview: false,
      documentationURL: expect.any(String),
    }));
  });

  it("registers the element and returns a stub without the card type", () => {
    const cardClass = customElements.get("cyclic-countdown-card") as
      | (CustomElementConstructor & { getStubConfig(): Record<string, unknown> })
      | undefined;
    expect(cardClass).toBeDefined();
    expect(cardClass?.getStubConfig()).not.toHaveProperty("type");
    expect(cardClass?.getStubConfig()).toEqual(expect.objectContaining({
      vertical_size: "standard",
      tap_action: "more-info",
      hold_action: "complete",
      double_tap_action: "none",
    }));
  });

  it("resolves the Home Assistant picker stub synchronously", async () => {
    const cardClass = customElements.get("cyclic-countdown-card") as
      | (CustomElementConstructor & {
          getStubConfig(
            hass: HomeAssistant,
            entities: string[],
            entitiesFallback: string[],
          ): Record<string, unknown> | Promise<Record<string, unknown>>;
        })
      | undefined;

    const stub = await Promise.race([
      Promise.resolve(cardClass?.getStubConfig(hass, [], [])),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("picker stub timed out")), 100);
      }),
    ]);

    expect({ type: "custom:cyclic-countdown-card", ...stub }).toEqual(
      expect.objectContaining({
        type: "custom:cyclic-countdown-card",
        vertical_size: "standard",
      }),
    );
  });

  it("preserves actions stored by an existing card", () => {
    card.setConfig(config({ tap_action: "complete", hold_action: "more-info" }));
    const configured = card as unknown as { _config: CardConfig };
    expect(configured._config.tap_action).toBe("complete");
    expect(configured._config.hold_action).toBe("more-info");
  });

  it("renders a large day count instead of percent", async () => {
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector(".days strong")?.textContent).toBe("13");
    expect(card.shadowRoot?.querySelector(".content")?.textContent).not.toContain("13%");
  });

  it("uses a compact completed label without consuming the secondary line", async () => {
    card.setConfig(config({ secondary_info: "last_completed" }));
    await card.updateComplete;
    const secondary = card.shadowRoot?.querySelector(".secondary");
    expect(secondary?.getAttribute("aria-label")).toContain("Выполнено");
    expect(secondary?.textContent).not.toContain("Выполнено");
    expect(secondary?.textContent).not.toContain("Последнее выполнение");
    expect(secondary?.querySelector("ha-icon")?.getAttribute("icon")).toBe("mdi:history");
    expect(secondary?.querySelector("time")?.getAttribute("datetime")).toBe("2026-08-09");
  });

  it.each(["bar", "fill"] as const)("renders %s style", async (style) => {
    card.setConfig(config({ style }));
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("ha-card")?.classList.contains(style)).toBe(true);
  });

  it.each(["compact", "standard", "wide"] as const)("renders %s vertical size", async (vertical_size) => {
    card.setConfig(config({ vertical_size }));
    await card.updateComplete;
    expect(card.shadowRoot?.querySelector("ha-card")?.classList.contains(vertical_size)).toBe(true);
  });

  it("uses one compact row, automatic standard height, and two wide rows without changing columns", () => {
    card.setConfig(config({ vertical_size: "compact" }));
    expect(card.getGridOptions().columns).toBe(6);
    expect(card.getGridOptions().rows).toBe(1);
    expect(card.getCardSize()).toBe(1);
    card.setConfig(config({ vertical_size: "standard" }));
    expect(card.getGridOptions().columns).toBe(6);
    expect(card.getGridOptions().rows).toBeUndefined();
    expect(card.getCardSize()).toBe(2);
    card.setConfig(config({ vertical_size: "wide" }));
    expect(card.getGridOptions().columns).toBe(6);
    expect(card.getGridOptions().rows).toBe(2);
    expect(card.getCardSize()).toBe(2);
  });

  it("maps the obsolete width setting to vertical size", () => {
    card.setConfig({ type: "custom:cyclic-countdown-card", width: "wide" } as Partial<CardConfig>);
    const configured = card as unknown as { _config: CardConfig & { width?: string } };
    expect(configured._config.vertical_size).toBe("wide");
    expect(configured._config.width).toBeUndefined();
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
    expect(card.shadowRoot?.querySelector("button")).toBeNull();
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

  it("sends only one completion for a configured double tap", async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    const request = vi.fn(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    ) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    card.hass = { ...hass, connection: { sendMessagePromise: request } };
    card.setConfig(config({ confirm_complete: false, double_tap_action: "complete" }));
    await card.updateComplete;
    const surface = card.shadowRoot?.querySelector<HTMLElement>(".card");
    surface?.click();
    surface?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(request).toHaveBeenCalledOnce();
    resolveRequest?.(hass.states["sensor.filter_countdown"].attributes);
  });
});
