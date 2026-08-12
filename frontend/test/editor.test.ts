import { beforeEach, describe, expect, it, vi } from "vitest";

import "../src/cyclic-countdown-card";
import type { CardConfig, HomeAssistant } from "../src/models/types";
import { addCalendarDays, todayIsoInTimeZone } from "../src/utils/calendar";

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
        items: { id: string }[] = [];
        disabled = false;

        attachComboBox() {
          const generic = this.shadowRoot?.querySelector("ha-generic-picker");
          if (!generic?.shadowRoot) return undefined;
          const comboBox = document.createElement("ha-picker-combo-box") as HTMLElement & {
            allItems?: unknown[];
            filteredItems?: unknown[];
            input?: (query: string) => unknown[];
            layout?: { pin: { index: number; block: string } };
            value?: string;
          };
          comboBox.input = (query) => {
            comboBox.filteredItems = (comboBox.allItems ?? []).filter((item) =>
              String((item as { id?: string }).id ?? item).includes(query),
            );
            return comboBox.filteredItems;
          };
          generic.shadowRoot.append(comboBox);
          return comboBox;
        }

        open() {
          if (this.disabled) return undefined;
          const comboBox = this.attachComboBox();
          this.dispatchEvent(new CustomEvent("picker-opened"));
          return comboBox;
        }

        connectedCallback() {
          if (this.shadowRoot) return;
          const root = this.attachShadow({ mode: "open" });
          const generic = document.createElement("ha-generic-picker") as HTMLElement & {
            getItems?: () => { id: string }[];
            lastOpenSelectedValue?: string;
            refreshCount?: number;
            refreshItems?: () => void;
            updateComplete?: Promise<unknown>;
            open?: (
              event?: Event,
              options?: { selectedValue?: string },
            ) => HTMLElement | undefined;
          };
          generic.attachShadow({ mode: "open" });
          generic.getItems = () => this.items;
          generic.updateComplete = Promise.resolve();
          generic.refreshItems = () => {
            generic.refreshCount = (generic.refreshCount ?? 0) + 1;
            const comboBox = generic.shadowRoot?.querySelector("ha-picker-combo-box") as
              | (HTMLElement & { allItems?: unknown[] })
              | null;
            if (comboBox) comboBox.allItems = [...this.items];
          };
          generic.open = (_event, options) => {
            generic.lastOpenSelectedValue = options?.selectedValue;
            const comboBox = this.attachComboBox() as HTMLElement & {
              allItems?: unknown[];
              layout?: { pin: { index: number; block: string } };
              value?: string;
            };
            comboBox.value = options?.selectedValue ?? (this as HTMLElement & { value?: string }).value;
            comboBox.allItems = [...this.items];
            if (comboBox.value) {
              const index = this.items.findIndex(
                (item) => (item as { id?: string }).id === comboBox.value,
              );
              comboBox.layout = { pin: { index: Math.max(0, index), block: "center" } };
            }
            generic.dispatchEvent(new CustomEvent("picker-opened", {
              bubbles: true,
              composed: true,
            }));
            return comboBox;
          };
          generic.shadowRoot?.append(document.createElement("ha-picker-field"));
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
    expect([...taskSelect!.options].map((option) => option.value)).toEqual(["task-1"]);
    expect(taskSelect?.value).toBe("task-1");
    expect((changed.mock.calls.at(-1)?.[0] as CustomEvent).detail.config.task_id).toBe("task-1");
    expect(editor.shadowRoot?.querySelector(".task-empty")).toBeNull();
    expect(editor.shadowRoot?.textContent).not.toContain("Task not found");

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

  it("shows reversible task modes while editing an existing card", async () => {
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
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    const taskSelect = editor.shadowRoot?.querySelector<HTMLSelectElement>("section select");
    expect([...taskSelect!.options].map((option) => option.value)).toEqual(["task-1"]);
    const modeButtons = editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(
      ".task-mode-picker button",
    );
    expect(modeButtons).toHaveLength(2);
    expect(modeButtons?.[1].getAttribute("aria-selected")).toBe("true");

    modeButtons?.[0].click();
    await editor.updateComplete;
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe("");
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

  it("preserves an unsaved existing-task draft when HA echoes presentation config", async () => {
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
    editor.addEventListener("config-changed", (event) => {
      editor.setConfig((event as CustomEvent<{ config: CardConfig }>).detail.config);
    });

    const name = editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]');
    name!.value = "Unsaved filter name";
    name!.dispatchEvent(new Event("input"));
    await editor.updateComplete;

    editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".style-option")[1].click();
    await editor.updateComplete;

    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Unsaved filter name",
    );
  });

  it("preserves a dirty existing draft across connection reload and task-mode round trip", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    const connection = (serverTask: typeof task): HomeAssistant["connection"] => ({
      sendMessagePromise: vi.fn(async (message: Record<string, unknown>) =>
        message.type === "cyclic_countdown/tasks/list" ? [serverTask] : []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
    });
    editor.hass = {
      language: "en",
      states: {},
      connection: connection(task),
    };
    await settle(editor);

    const name = editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]');
    name!.value = "Local unsaved name";
    name!.dispatchEvent(new Event("input"));
    await editor.updateComplete;

    editor.hass = {
      language: "en",
      states: {},
      connection: connection({ ...task, name: "New server name" }),
    };
    await settle(editor);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Local unsaved name",
    );

    editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[0].click();
    await editor.updateComplete;
    editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[1].click();
    await editor.updateComplete;
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Local unsaved name",
    );
  });

  it("ignores a genuinely overlapping load from a replaced connection", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    let resolveOldTasks: ((tasks: typeof task[]) => void) | undefined;
    const oldTasks = new Promise<typeof task[]>((resolve) => { resolveOldTasks = resolve; });
    const oldConnection: HomeAssistant["connection"] = {
      sendMessagePromise: vi.fn((message: Record<string, unknown>) =>
        message.type === "cyclic_countdown/tasks/list"
          ? oldTasks
          : Promise.resolve([])) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
    };
    const freshTask = { ...task, name: "Fresh connection task" };
    const newConnection: HomeAssistant["connection"] = {
      sendMessagePromise: vi.fn(async (message: Record<string, unknown>) =>
        message.type === "cyclic_countdown/tasks/list" ? [freshTask] : []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
    };

    editor.hass = { language: "en", states: {}, connection: oldConnection };
    await editor.updateComplete;
    await Promise.resolve();
    editor.hass = { language: "en", states: {}, connection: newConnection };
    await settle(editor);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Fresh connection task",
    );

    resolveOldTasks?.([{ ...task, name: "Stale connection task" }]);
    await settle(editor);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Fresh connection task",
    );
  });

  it("keeps task editing available when notification targets fail to load", async () => {
    const taskWithSavedTarget = {
      ...task,
      notifications_enabled: true,
      notification_targets: ["notify.saved_phone"],
    };
    let updatePayload: Record<string, unknown> | undefined;
    mountEditor({ ...config, task_id: task.task_id });
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async (message: Record<string, unknown>) => {
          if (message.type === "cyclic_countdown/tasks/list") return [taskWithSavedTarget];
          if (message.type === "cyclic_countdown/notification_targets/list") {
            throw new Error("targets unavailable");
          }
          if (message.type === "cyclic_countdown/tasks/update") {
            updatePayload = message;
            return {
              ...taskWithSavedTarget,
              warning_days: Number(message.warning_days),
            };
          }
          return [];
        }) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);

    expect(editor.shadowRoot?.textContent).toContain("Appearance");
    expect(editor.shadowRoot?.textContent).toContain("Notification targets could not be loaded");
    expect(editor.shadowRoot?.querySelector(".integration-error")).toBeNull();
    const warning = editor.shadowRoot?.querySelector(".section-message");
    expect(warning?.closest("section")?.textContent).toContain("Notifications");
    const savedTarget = editor.shadowRoot?.querySelector<HTMLOptionElement>(
      'option[value="notify.saved_phone"]',
    );
    expect(savedTarget?.selected).toBe(true);
    expect(savedTarget?.textContent).toContain("unavailable");

    const numberInputs = editor.shadowRoot?.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    );
    numberInputs![1].value = "2";
    numberInputs![1].dispatchEvent(new Event("input"));
    await editor.updateComplete;
    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await settle(editor);

    expect(updatePayload).toEqual(expect.objectContaining({
      warning_days: 2,
      notification_targets: ["notify.saved_phone"],
    }));
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

  it("initializes new tasks and Today from the Home Assistant timezone", async () => {
    const browserDate = todayIsoInTimeZone();
    const timeZone = ["Pacific/Kiritimati", "Pacific/Honolulu"].find(
      (candidate) => todayIsoInTimeZone(candidate) !== browserDate,
    )!;
    const expectedToday = todayIsoInTimeZone(timeZone);
    mountEditor();
    editor.hass = {
      language: "en",
      config: { time_zone: timeZone },
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);

    const dateInput = editor.shadowRoot?.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput?.value).toBe(expectedToday);
    const preview = editor.shadowRoot?.querySelector("cyclic-countdown-card") as unknown as {
      previewTask: { due_date: string };
    };
    expect(preview.previewTask.due_date).toBe(addCalendarDays(expectedToday, 14));

    dateInput!.value = "2020-01-01";
    dateInput!.dispatchEvent(new Event("input"));
    await editor.updateComplete;
    const todayButton = [...(editor.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") || [])]
      .find((button) => button.textContent === "Today");
    todayButton?.click();
    await editor.updateComplete;
    expect(dateInput?.value).toBe(expectedToday);
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

  it("does not hydrate or rebind the card from a late save response", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    let resolveSave: ((value: typeof task) => void) | undefined;
    const saveResponse = new Promise<typeof task>((resolve) => { resolveSave = resolve; });
    const request = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return Promise.resolve([task]);
      if (message.type === "cyclic_countdown/notification_targets/list") return Promise.resolve([]);
      if (message.type === "cyclic_countdown/tasks/update") return saveResponse;
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: request } };
    await settle(editor);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await Promise.resolve();
    editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[0].click();
    await editor.updateComplete;
    const changesAfterModeSwitch = changed.mock.calls.length;

    resolveSave?.({ ...task, name: "Late saved task" });
    await settle(editor);

    expect(changed).toHaveBeenCalledTimes(changesAfterModeSwitch);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe("");
    expect(editor.shadowRoot?.textContent).not.toContain("Task changes saved");
  });

  it("does not apply a late save response to a different selected task", async () => {
    const secondTask = { ...task, task_id: "task-2", name: "Second task" };
    mountEditor({ ...config, task_id: task.task_id });
    let resolveSave: ((value: typeof task) => void) | undefined;
    const saveResponse = new Promise<typeof task>((resolve) => { resolveSave = resolve; });
    const request = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") {
        return Promise.resolve([task, secondTask]);
      }
      if (message.type === "cyclic_countdown/notification_targets/list") return Promise.resolve([]);
      if (message.type === "cyclic_countdown/tasks/update") return saveResponse;
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: request } };
    await settle(editor);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await Promise.resolve();
    const taskSelect = editor.shadowRoot?.querySelector<HTMLSelectElement>("section select");
    taskSelect!.value = secondTask.task_id;
    taskSelect!.dispatchEvent(new Event("change"));
    await editor.updateComplete;
    const changesAfterTaskSwitch = changed.mock.calls.length;

    resolveSave?.({ ...task, name: "Late saved task" });
    await settle(editor);

    expect(changed).toHaveBeenCalledTimes(changesAfterTaskSwitch);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Second task",
    );
    expect(editor.shadowRoot?.textContent).not.toContain("Task changes saved");
  });

  it("does not hydrate from a save response owned by a replaced connection", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    let resolveSave: ((value: typeof task) => void) | undefined;
    const saveResponse = new Promise<typeof task>((resolve) => { resolveSave = resolve; });
    const oldRequest = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return Promise.resolve([task]);
      if (message.type === "cyclic_countdown/notification_targets/list") return Promise.resolve([]);
      if (message.type === "cyclic_countdown/tasks/update") return saveResponse;
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: oldRequest } };
    await settle(editor);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await Promise.resolve();
    const freshTask = { ...task, name: "Fresh connection task" };
    const newRequest = vi.fn(async (message: Record<string, unknown>) =>
      message.type === "cyclic_countdown/tasks/list" ? [freshTask] : []) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: newRequest } };
    await settle(editor);
    const changesAfterReplacement = changed.mock.calls.length;
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.disabled).toBe(false);

    resolveSave?.({ ...task, name: "Late saved task" });
    await settle(editor);

    expect(changed).toHaveBeenCalledTimes(changesAfterReplacement);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Fresh connection task",
    );
    expect(editor.shadowRoot?.textContent).not.toContain("Task changes saved");
  });

  it("resets a disconnected save without letting its late finally clear a new save", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    const saveResolvers: ((value: typeof task) => void)[] = [];
    const request = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return Promise.resolve([task]);
      if (message.type === "cyclic_countdown/notification_targets/list") return Promise.resolve([]);
      if (message.type === "cyclic_countdown/tasks/update") {
        return new Promise<typeof task>((resolve) => { saveResolvers.push(resolve); });
      }
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: request } };
    await settle(editor);

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await editor.updateComplete;
    expect(saveResolvers).toHaveLength(1);
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.disabled).toBe(true);

    editor.remove();
    document.body.append(editor);
    await settle(editor);
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.disabled).toBe(false);

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.click();
    await editor.updateComplete;
    expect(saveResolvers).toHaveLength(2);
    saveResolvers[0]({ ...task, name: "Stale disconnected save" });
    await settle(editor);
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.disabled).toBe(true);

    saveResolvers[1]({ ...task, name: "Current save" });
    await settle(editor);
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.save")?.disabled).toBe(false);
    expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
      "Current save",
    );
  });

  it("does not redirect the editor from a late delete response", async () => {
    mountEditor({ ...config, task_id: task.task_id });
    let resolveDelete: (() => void) | undefined;
    const deleteResponse = new Promise<void>((resolve) => { resolveDelete = resolve; });
    const request = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") return Promise.resolve([task]);
      if (message.type === "cyclic_countdown/notification_targets/list") return Promise.resolve([]);
      if (message.type === "cyclic_countdown/tasks/delete") return deleteResponse;
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: request } };
    await settle(editor);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    try {
      editor.shadowRoot?.querySelector<HTMLButtonElement>("button.danger")?.click();
      await Promise.resolve();
      editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[0].click();
      await editor.updateComplete;
      const changesAfterModeSwitch = changed.mock.calls.length;

      resolveDelete?.();
      await settle(editor);

      expect(changed).toHaveBeenCalledTimes(changesAfterModeSwitch);
      expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe("");
      expect(editor.shadowRoot?.textContent).not.toContain("Task deleted");
    } finally {
      confirm.mockRestore();
    }
  });

  it("reconciles only the deleted identity after navigating away and back", async () => {
    const secondTask = { ...task, task_id: "task-2", name: "Second task" };
    mountEditor({ ...config, task_id: task.task_id });
    let resolveDelete: (() => void) | undefined;
    const deleteResponse = new Promise<void>((resolve) => { resolveDelete = resolve; });
    const request = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") {
        return Promise.resolve([task, secondTask]);
      }
      if (message.type === "cyclic_countdown/notification_targets/list") return Promise.resolve([]);
      if (message.type === "cyclic_countdown/tasks/delete") return deleteResponse;
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: request } };
    await settle(editor);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const changed = vi.fn();
    editor.addEventListener("config-changed", changed);
    try {
      editor.shadowRoot?.querySelector<HTMLButtonElement>("button.danger")?.click();
      await Promise.resolve();
      const modeButtons = editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        ".task-mode-picker button",
      );
      modeButtons?.[0].click();
      await editor.updateComplete;
      editor.shadowRoot?.querySelectorAll<HTMLButtonElement>(".task-mode-picker button")[1].click();
      await editor.updateComplete;
      expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
        "Bacteria",
      );

      resolveDelete?.();
      await settle(editor);

      expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[required]')?.value).toBe(
        "Second task",
      );
      expect(editor.shadowRoot?.querySelector<HTMLSelectElement>("section select")?.value).toBe(
        secondTask.task_id,
      );
      expect(editor.shadowRoot?.textContent).not.toContain("Task not found");
      expect((changed.mock.calls.at(-1)?.[0] as CustomEvent).detail.config.task_id).toBe(
        secondTask.task_id,
      );
    } finally {
      confirm.mockRestore();
    }
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

  it("ignores a stale notification test without clearing the new task test", async () => {
    const firstTask = {
      ...task,
      notifications_enabled: true,
      notification_targets: ["notify.ipad"],
    };
    const secondTask = { ...firstTask, task_id: "task-2", name: "Second task" };
    const testResolvers: ((
      value: { delivered: string[]; failed: string[] },
    ) => void)[] = [];
    mountEditor({ ...config, task_id: firstTask.task_id });
    const request = vi.fn((message: Record<string, unknown>) => {
      if (message.type === "cyclic_countdown/tasks/list") {
        return Promise.resolve([firstTask, secondTask]);
      }
      if (message.type === "cyclic_countdown/notification_targets/list") {
        return Promise.resolve([{
          id: "notify.ipad",
          name: "iPad",
          available: true,
          kind: "entity",
        }]);
      }
      if (message.type === "cyclic_countdown/notifications/test") {
        return new Promise<{ delivered: string[]; failed: string[] }>((resolve) => {
          testResolvers.push(resolve);
        });
      }
      return Promise.resolve([]);
    }) as unknown as HomeAssistant["connection"]["sendMessagePromise"];
    editor.hass = { language: "en", states: {}, connection: { sendMessagePromise: request } };
    await settle(editor);

    editor.shadowRoot?.querySelector<HTMLButtonElement>("button.ghost")?.click();
    await editor.updateComplete;
    expect(testResolvers).toHaveLength(1);

    const taskSelect = editor.shadowRoot?.querySelector<HTMLSelectElement>("section select");
    taskSelect!.value = secondTask.task_id;
    taskSelect!.dispatchEvent(new Event("change"));
    await editor.updateComplete;
    const currentTestButton = editor.shadowRoot?.querySelector<HTMLButtonElement>("button.ghost");
    expect(currentTestButton?.disabled).toBe(false);
    currentTestButton?.click();
    await editor.updateComplete;
    expect(testResolvers).toHaveLength(2);

    testResolvers[0]({ delivered: ["notify.ipad"], failed: [] });
    await settle(editor);
    expect(editor.shadowRoot?.textContent).not.toContain("Test sent: 1; failed: 0");
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.ghost")?.disabled).toBe(true);

    testResolvers[1]({ delivered: ["notify.ipad"], failed: [] });
    await settle(editor);
    expect(editor.shadowRoot?.textContent).toContain("Test sent: 1; failed: 0");
    expect(editor.shadowRoot?.querySelector<HTMLButtonElement>("button.ghost")?.disabled).toBe(false);
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

  it("keeps the icon picker closed until its readiness gate reports items", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      items: { id: string }[];
      disabled: boolean;
      open: () => HTMLElement | undefined;
    };

    expect(picker.disabled).toBe(true);
    expect(picker.open()).toBeUndefined();

    picker.items = [
      { id: "mdi:baby-face-outline" },
      { id: "mdi:backspace" },
      { id: "mdi:bacteria" },
    ];
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(picker.disabled).toBe(true);

    picker.items.push({ id: "mdi:account" });
    await vi.waitFor(async () => {
      await editor.updateComplete;
      expect(picker.disabled).toBe(false);
    });

    expect(picker.open()).toBeDefined();
  });

  it("opens an existing icon without HA's selected-value pin", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      disabled: boolean;
      items: { id: string }[];
      value?: string;
    };
    picker.items = [
      { id: "mdi:account" },
      { id: "mdi:bacteria" },
      { id: "mdi:wrench-clock" },
    ];
    await vi.waitFor(async () => {
      await editor.updateComplete;
      expect(picker.disabled).toBe(false);
    });

    const generic = picker.shadowRoot?.querySelector("ha-generic-picker") as HTMLElement & {
      lastOpenSelectedValue?: string;
      refreshCount?: number;
    };
    const field = generic.shadowRoot?.querySelector("ha-picker-field");
    field?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    expect(picker.value).toBe("mdi:wrench-clock");
    expect(generic.lastOpenSelectedValue).toBe("");
    await vi.waitFor(() => expect(generic.refreshCount).toBe(1));
    const comboBox = generic.shadowRoot?.querySelector("ha-picker-combo-box") as HTMLElement & {
      allItems: unknown[];
      filteredItems?: unknown[];
      input(query: string): unknown[];
      layout?: unknown;
      value?: string;
    };
    expect(comboBox.value).toBe("");
    expect(comboBox.layout).toBeUndefined();
    expect(comboBox.allItems).toEqual(picker.items);
    comboBox.input("b");
    comboBox.input("bac");
    expect(comboBox.input("bact")).toEqual([{ id: "mdi:bacteria" }]);
  });

  it("leaves the native clear control on its normal path", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      disabled: boolean;
      items: { id: string }[];
    };
    picker.items = [{ id: "mdi:account" }, { id: "mdi:wrench-clock" }];
    await vi.waitFor(() => expect(picker.disabled).toBe(false));

    const generic = picker.shadowRoot?.querySelector("ha-generic-picker") as HTMLElement & {
      lastOpenSelectedValue?: string;
    };
    const clear = document.createElement("ha-icon-button");
    clear.classList.add("clear");
    generic.shadowRoot?.querySelector("ha-picker-field")?.append(clear);
    clear.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    expect(generic.lastOpenSelectedValue).toBeUndefined();
  });

  it("restarts icon-index readiness after the editor is reattached", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      items: { id: string }[];
      disabled: boolean;
    };
    expect(picker.disabled).toBe(true);

    editor.remove();
    picker.items = [{ id: "mdi:account" }, { id: "mdi:bacteria" }];
    document.body.append(editor);

    await vi.waitFor(async () => {
      await editor.updateComplete;
      expect(picker.disabled).toBe(false);
    });
  });

  it("falls back to a typed icon field if the native index never loads", async () => {
    editor.hass = {
      language: "en",
      states: {},
      connection: {
        sendMessagePromise: vi.fn(async () => []) as unknown as HomeAssistant["connection"]["sendMessagePromise"],
      },
    };
    await settle(editor);
    const picker = editor.shadowRoot?.querySelector("ha-icon-picker") as HTMLElement & {
      disabled: boolean;
    };
    expect(picker.disabled).toBe(true);

    const now = vi.spyOn(performance, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
    try {
      await vi.waitFor(async () => {
        await editor.updateComplete;
        expect(editor.shadowRoot?.querySelector("ha-icon-picker")).toBeNull();
      });
      expect(editor.shadowRoot?.querySelector<HTMLInputElement>('input[placeholder="mdi:wrench-clock"]'))
        .not.toBeNull();
    } finally {
      now.mockRestore();
    }
  });
});
