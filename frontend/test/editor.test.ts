import { beforeEach, describe, expect, it, vi } from "vitest";

import "../src/cyclic-countdown-card";
import type { CardConfig, HomeAssistant } from "../src/models/types";

const config: CardConfig = {
  type: "custom:cyclic-countdown-card" as const,
  style: "bar" as const,
  vertical_size: "standard" as const,
  reverse_progress: false,
  confirm_complete: true,
  show_secondary: true,
  secondary_info: "last_completed" as const,
  tap_action: "more-info" as const,
  hold_action: "complete" as const,
  double_tap_action: "none" as const,
};

const task = {
  task_id: "task-1",
  name: "Bacteria",
  icon: "mdi:bacteria",
  interval_days: 14,
  last_completed_date: "2026-08-10",
  due_date: "2026-08-24",
  warning_days: 1,
  notifications_enabled: false,
  persistent_notification_enabled: false,
  notification_targets: [],
  notification_title: "",
  notification_message: "{name}: {days} · {due_date}",
  notify_on_warning: true,
  notify_on_due: true,
  remaining_days: 14,
  elapsed_progress: 0,
  phase: "normal" as const,
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

  const mountEditor = (initialConfig = config) => {
    if (!customElements.get("ha-icon-picker")) {
      customElements.define("ha-icon-picker", class extends HTMLElement {
        items: unknown[] = [];

        connectedCallback() {
          if (this.shadowRoot) return;
          const root = this.attachShadow({ mode: "open" });
          const generic = document.createElement("ha-generic-picker") as HTMLElement & {
            getItems?: () => unknown[];
            refreshItems?: ReturnType<typeof vi.fn>;
          };
          generic.getItems = () => this.items;
          generic.refreshItems = vi.fn();
          root.append(generic);
        }
      });
    }
    editor = document.createElement("cyclic-countdown-editor") as typeof editor;
    editor.setConfig(initialConfig);
    document.body.replaceChildren(editor);
  };

  beforeEach(() => {
    mountEditor();
  });

  it.each([
    ["ru", "Внешний вид", "Новая задача"],
    ["en", "Appearance", "New task"],
    ["de", "Appearance", "New task"],
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

  it("switches between a new draft and an existing task without trapping or losing either", async () => {
    const request = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return [task];
      return [];
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = {
      language: "en",
      states: {},
      connection: { sendMessagePromise: request },
    };
    await settle(editor);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);

    const draftName = editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]');
    draftName!.value = "Draft filter";
    draftName!.dispatchEvent(new Event("input"));
    await editor.updateComplete;

    const modeButtons = editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(
      ".task-mode-picker button",
    );
    expect(modeButtons).toHaveLength(2);
    modeButtons?.[1].click();
    await editor.updateComplete;

    const taskSelect = editor.shadowRoot?.querySelector<HTMLSelectElement>("section select");
    expect([...taskSelect!.options].map((option) => option.value)).toEqual(["", "task-1"]);
    taskSelect!.value = "task-1";
    taskSelect!.dispatchEvent(new Event("change"));
    await editor.updateComplete;

    expect((changed.mock.calls.at(-1)?.[0] as CustomEvent).detail.config.task_id).toBe("task-1");
    const selectedTaskSelect = editor.shadowRoot!.querySelector<HTMLSelectElement>("section select")!;
    expect([...selectedTaskSelect.options].map((option) => option.value)).toEqual(["task-1"]);

    editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[0].click();
    await editor.updateComplete;
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Draft filter",
    );
    expect((changed.mock.calls.at(-1)?.[0] as CustomEvent).detail.config).not.toHaveProperty(
      "task_id",
    );

    editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[1].click();
    await editor.updateComplete;
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Bacteria",
    );
    expect((changed.mock.calls.at(-1)?.[0] as CustomEvent).detail.config.task_id).toBe("task-1");
  });

  it("does not offer task creation while editing an existing card", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async (message: Record<string, unknown>) =>
          message.type === "cyclic_countdown/tasks/list" ? [task] : []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const taskSelect = editor.shadowRoot?.querySelector<HTMLSelectElement>("section select");
    expect([...taskSelect!.options].map((option) => option.value)).toEqual(["task-1"]);
    expect(editor.shadowRoot?.querySelector(".task-mode-picker")).toBeNull();
    expect(editor.shadowRoot?.textContent).not.toContain("New task");
  });

  it("writes the selected height into Home Assistant grid options without changing columns", async () => {
    editor.setConfig({
      ...config,
      grid_options: { columns: 8, min_columns: 4 },
    });
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
    const sizeButtons = editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".size-picker button");

    sizeButtons?.[0].click();
    expect((changed.mock.calls[0][0] as CustomEvent).detail.config).toEqual(
      expect.objectContaining({
        vertical_size: "compact",
        grid_options: { columns: 8, min_columns: 4, rows: 1 },
        show_secondary: true,
      }),
    );
    await editor.updateComplete;
    const preview = editor.shadowRoot?.querySelector("cyclic-countdown-card") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    await preview.updateComplete;
    expect(preview.shadowRoot?.querySelector("ha-card")?.classList.contains("compact")).toBe(true);

    sizeButtons?.[1].click();
    expect((changed.mock.calls[1][0] as CustomEvent).detail.config).toEqual(
      expect.objectContaining({
        vertical_size: "standard",
        grid_options: { columns: 8, min_columns: 4, rows: "auto" },
      }),
    );
    await editor.updateComplete;
    await preview.updateComplete;
    expect(preview.shadowRoot?.querySelector("ha-card")?.classList.contains("standard")).toBe(true);

    sizeButtons?.[2].click();
    expect((changed.mock.calls[2][0] as CustomEvent).detail.config).toEqual(
      expect.objectContaining({
        vertical_size: "wide",
        grid_options: { columns: 8, min_columns: 4, rows: 2 },
      }),
    );
    await editor.updateComplete;
    await preview.updateComplete;
    expect(preview.shadowRoot?.querySelector("ha-card")?.classList.contains("wide")).toBe(true);
  });

  it("offers the same three actions for tap, hold, and double tap", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const behavior = [...(editor.shadowRoot?.querySelectorAll("section") || [])][2];
    const selects = behavior.querySelectorAll("select");
    expect(selects).toHaveLength(3);
    for (const select of selects) {
      expect([...select.options].map((option) => option.value)).toEqual([
        "complete",
        "more-info",
        "none",
      ]);
    }
  });

  it("recalculates the live preview immediately from edited dates", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dateInput = editor.shadowRoot?.querySelector<HTMLInputElement>('input[type="date"]');
    const intervalInput = editor.shadowRoot?.querySelector<HTMLInputElement>('input[type="number"]');
    dateInput!.value = iso;
    dateInput!.dispatchEvent(new Event("input"));
    intervalInput!.value = "3";
    intervalInput!.dispatchEvent(new Event("input"));
    await editor.updateComplete;
    const preview = editor.shadowRoot?.querySelector("cyclic-countdown-card") as unknown as {
      previewTask: { remaining_days: number; phase: string };
    };
    expect(preview.previewTask.remaining_days).toBe(3);
    expect(preview.previewTask.phase).toBe("normal");
  });

  it("normalizes a typed icon name and saves an existing task", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    const request = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return [task];
      if (message.type === "cyclic_countdown/notification_targets/list") return [];
      if (message.type === "cyclic_countdown/tasks/update") {
        return { ...task, ...message };
      }
      return [];
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = {
      language: "ru",
      states: {},
      connection: { sendMessagePromise: request },
    };
    await settle(editor);

    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      value?: string;
    };
    picker.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: "Bacteria" },
    }));
    await editor.updateComplete;
    expect(picker.value).toBe("mdi:bacteria");

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await settle(editor);

    const update = (request as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((message) => message.type === "cyclic_countdown/tasks/update");
    expect(update?.icon).toBe("mdi:bacteria");
    expect(editor.shadowRoot?.textContent).toContain("Редактор карточки можно закрыть");
  });

  it("uses the current unsaved draft when sending a test notification", async () => {
    const notificationTask = {
      ...task,
      notifications_enabled: true,
      notification_targets: ["notify.ipad"],
      notification_message: "Old message",
    };
    mountEditor({ ...config, task_id: task.task_id });
    const request = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return [notificationTask];
      if (message.type === "cyclic_countdown/notification_targets/list") {
        return [{
          id: "notify.ipad",
          name: "iPad",
          available: true,
          kind: "entity",
        }];
      }
      if (message.type === "cyclic_countdown/notifications/test") {
        return { delivered: ["notify.ipad"], failed: [] };
      }
      return [];
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = {
      language: "en",
      states: {},
      connection: { sendMessagePromise: request },
    };
    await settle(editor);

    const notifications = [...(editor.shadowRoot?.querySelectorAll("section") || [])][3];
    const message = notifications.querySelector("textarea")!;
    message.value = "Current {name}: {days}";
    message.dispatchEvent(new Event("input"));
    await editor.updateComplete;
    notifications.querySelector<HTMLButtonElement>("button.ghost")?.click();
    await settle(editor);

    const testRequest = (request as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((item) => item.type === "cyclic_countdown/notifications/test");
    expect(testRequest).toEqual(expect.objectContaining({
      notification_message: "Current {name}: {days}",
      name: "Bacteria",
      task_id: "task-1",
      targets: ["notify.ipad"],
    }));
    expect(editor.shadowRoot?.textContent).toContain("Test sent: 1; failed: 0");
  });

  it("updates the icon picker for a new task", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      value?: string;
    };

    picker.dispatchEvent(new CustomEvent("value-changed", {
      detail: { value: "Water-Pump" },
    }));
    await editor.updateComplete;

    expect(picker.value).toBe("mdi:water-pump");
  });

  it("refreshes the native icon list when its asynchronous index becomes ready", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      items: unknown[];
    };
    const generic = picker.shadowRoot?.querySelector("ha-generic-picker") as HTMLElement & {
      refreshItems: ReturnType<typeof vi.fn>;
    };
    vi.useFakeTimers();
    try {
      picker.dispatchEvent(new CustomEvent("picker-opened"));
      expect(generic.refreshItems).not.toHaveBeenCalled();

      picker.items = ["mdi:bacteria"];
      await vi.advanceTimersByTimeAsync(100);

      expect(generic.refreshItems).toHaveBeenCalledOnce();
      picker.dispatchEvent(new CustomEvent("picker-closed"));
    } finally {
      vi.useRealTimers();
    }
  });
});
