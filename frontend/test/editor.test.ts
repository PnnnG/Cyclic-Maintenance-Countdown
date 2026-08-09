import { beforeEach, describe, expect, it, vi } from "vitest";

import "../src/cyclic-countdown-card";
import type { HomeAssistant } from "../src/models/types";

const config = {
  type: "custom:cyclic-countdown-card" as const,
  style: "bar" as const,
  reverse_progress: false,
  confirm_complete: true,
  show_secondary: true,
  secondary_info: "last_completed" as const,
  tap_action: "complete" as const,
  hold_action: "more-info" as const,
};

async function settle(element: HTMLElement & { updateComplete: Promise<unknown> }) {
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
}

describe("cyclic-countdown-editor", () => {
  let editor: HTMLElement & {
    hass: HomeAssistant;
    setConfig(value: typeof config): void;
    updateComplete: Promise<unknown>;
  };

  beforeEach(() => {
    editor = document.createElement("cyclic-countdown-editor") as typeof editor;
    editor.setConfig(config);
    document.body.replaceChildren(editor);
  });

  it.each([
    ["ru", "Внешний вид", "Создать новую задачу"],
    ["en", "Appearance", "Create a new task"],
    ["de", "Appearance", "Create a new task"],
  ])("localizes the visual editor in %s", async (language, heading, create) => {
    editor.hass = {
      language,
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    expect(editor.shadowRoot?.textContent).toContain(heading);
    expect(editor.shadowRoot?.textContent).toContain(create);
  });

  it("shows a direct integration error with retry", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => Promise.reject(new Error("missing"))) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    expect(editor.shadowRoot?.textContent).toContain("not loaded");
    expect(editor.shadowRoot?.textContent).toContain("Retry");
  });

  it("emits live presentation config changes", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    const styleButtons = editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".style-option");
    styleButtons?.[1].click();
    expect(changed).toHaveBeenCalledOnce();
    expect((changed.mock.calls[0][0] as CustomEvent).detail.config.style).toBe("fill");
  });
});
