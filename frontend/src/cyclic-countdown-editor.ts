import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";

import { editorStrings } from "./localize/editor";
import type {
  CardConfig,
  CountdownTask,
  HomeAssistant,
  NotificationTarget,
  PreviewPhase,
} from "./models/types";
import {
  addCalendarDays,
  calendarDayDifference,
  dateOnlyValue,
  todayIsoInTimeZone,
} from "./utils/calendar";

type Draft = Omit<CountdownTask, "task_id" | "cycle_id"> & { task_id?: string };
type TaskMode = "new" | "existing";
interface ExistingDraftState {
  draft: Draft;
  dirty: boolean;
}

const DEFAULT_CARD_CONFIG: CardConfig = {
  type: "custom:cyclic-countdown-card",
  style: "bar",
  vertical_size: "standard",
  reverse_progress: false,
  confirm_complete: true,
  show_secondary: true,
  secondary_info: "last_completed",
  tap_action: "more-info",
  hold_action: "complete",
  double_tap_action: "none",
};

const ICON_PATTERN = /^[a-z0-9_-]+:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_INDEX_SENTINEL = "mdi:account";
const ICON_INDEX_POLL_MS = 100;
const ICON_INDEX_TIMEOUT_MS = 10_000;

interface GenericIconPickerElement extends HTMLElement {
  disabled?: boolean;
  getItems?: () => IconPickerItem[] | undefined;
  open?: (event?: Event, options?: { selectedValue?: string }) => void | Promise<void>;
  refreshItems?: () => void;
  updateComplete?: Promise<unknown>;
}

interface IconPickerItem {
  id?: string;
}

const normalizeIcon = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!normalized) return "mdi:wrench-clock";
  return normalized.includes(":") ? normalized : `mdi:${normalized}`;
};

const newDraft = (today = todayIsoInTimeZone()): Draft => ({
  name: "",
  icon: "mdi:wrench-clock",
  interval_days: 14,
  last_completed_date: today,
  due_date: "",
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
  phase: "normal",
});

const cloneDraft = (draft: Draft): Draft => ({
  ...draft,
  notification_targets: [...draft.notification_targets],
});

export class CyclicCountdownEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _tasks: { state: true },
    _targets: { state: true },
    _draft: { state: true },
    _previewPhase: { state: true },
    _loading: { state: true },
    _saving: { state: true },
    _deleting: { state: true },
    _testing: { state: true },
    _iconPickerDefined: { state: true },
    _iconIndexReady: { state: true },
    _iconIndexUnavailable: { state: true },
    _taskMode: { state: true },
    _error: { state: true },
    _notice: { state: true },
    _loadFailed: { state: true },
    _targetsLoadFailed: { state: true },
  };

  hass?: HomeAssistant;
  private _config?: CardConfig;
  private _tasks: CountdownTask[] = [];
  private _targets: NotificationTarget[] = [];
  private _draft: Draft = newDraft();
  private _previewPhase: PreviewPhase = "auto";
  private _loading = true;
  private _saving = false;
  private _deleting = false;
  private _testing = false;
  private _iconPickerDefined = Boolean(customElements.get("ha-icon-picker"));
  private _iconIndexReady = false;
  private _iconIndexUnavailable = false;
  private _taskMode: TaskMode = "new";
  private _sessionInitialized = false;
  private _newTaskDraft: Draft = newDraft();
  private _newTaskDraftDirty = false;
  private _existingTaskDraftDirty = false;
  private _existingDrafts = new Map<string, ExistingDraftState>();
  private _existingTaskId?: string;
  private _iconIndexTimer?: number;
  private _iconIndexWaitStarted?: number;
  private _error = "";
  private _notice = "";
  private _loadFailed = false;
  private _targetsLoadFailed = false;
  private _loadedConnection?: HomeAssistant["connection"];
  private _loadEpoch = 0;
  private _mutationEpoch = 0;
  private _taskServerMutationEpochs = new Map<string, number>();
  private _operationSerial = 0;
  private _saveOperation?: number;
  private _deleteOperation?: number;
  private _testOperation?: number;
  private readonly _iconPickerClickListener = {
    capture: true,
    handleEvent: (event: Event) => this.openIconPickerWithoutPinnedValue(event),
  };

  private get locale(): string {
    return this.hass?.locale?.language || this.hass?.language || navigator.language;
  }

  private get currentDateIso(): string {
    return todayIsoInTimeZone(this.hass?.config?.time_zone);
  }

  private get s() {
    return editorStrings(this.locale);
  }

  private get visibleTargets(): NotificationTarget[] {
    const known = new Set(this._targets.map((target) => target.id));
    const missing = this._draft.notification_targets
      .filter((target) => !known.has(target))
      .map((target) => ({
        id: target,
        name: target,
        available: false,
        kind: "legacy_service" as const,
      }));
    return [...this._targets, ...missing];
  }

  private get draftInvalid(): boolean {
    return (
      !this._draft.name.trim() ||
      !ICON_PATTERN.test(this._draft.icon) ||
      this._draft.interval_days < 1 ||
      this._draft.warning_days < 0 ||
      this._draft.warning_days > this._draft.interval_days ||
      (this._draft.notifications_enabled && !this._draft.notification_message.trim())
    );
  }

  private get saveDisabled(): boolean {
    return this._saving || this._deleting || this._testing || this.draftInvalid;
  }

  private get hasEditableTask(): boolean {
    return this._taskMode === "new" || Boolean(this._draft.task_id);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.retryUnavailableIconIndex();
    if (!this._sessionInitialized && this._config) this.initializeTaskSession(this._config);
    if (!this._iconPickerDefined) {
      void customElements.whenDefined("ha-icon-picker").then(() => {
        this._iconPickerDefined = true;
      });
    }
    // A card editor can be detached and re-attached by HA without another
    // reactive update. Restart the readiness probe after the existing render
    // has been reconnected, otherwise the picker can remain disabled forever.
    void this.updateComplete.then(() => {
      if (this.isConnected) this.ensureIconIndexReady();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._mutationEpoch += 1;
    this.invalidatePendingOperations();
    this.stopIconIndexProbe();
  }

  private initializeTaskSession(config: CardConfig): void {
    this._sessionInitialized = true;
    this._taskMode = config.task_id ? "existing" : "new";
    this._existingTaskId = config.task_id;
  }

  private activateExistingTask(task: CountdownTask): void {
    this.rememberExistingDraft();
    const cached = this._existingDrafts.get(task.task_id);
    const dirty = cached?.dirty === true;
    const draft = dirty ? cloneDraft(cached.draft) : cloneDraft(task);
    this._existingDrafts.set(task.task_id, { draft: cloneDraft(draft), dirty });
    this._taskMode = "existing";
    this._existingTaskId = task.task_id;
    this._existingTaskDraftDirty = dirty;
    this._draft = draft;
  }

  private rememberExistingDraft(): void {
    if (this._taskMode !== "existing" || !this._draft.task_id) return;
    this._existingDrafts.set(this._draft.task_id, {
      draft: cloneDraft(this._draft),
      dirty: this._existingTaskDraftDirty,
    });
  }

  private mutationIsCurrent(
    epoch: number,
    connection: HomeAssistant["connection"],
    mode: TaskMode,
    taskId: string | undefined,
  ): boolean {
    return (
      this.isConnected
      && this._mutationEpoch === epoch
      && this.hass?.connection === connection
      && this._taskMode === mode
      && this._draft.task_id === taskId
    );
  }

  private invalidateTestOperation(): void {
    this._testOperation = undefined;
    this._testing = false;
  }

  private invalidatePendingOperations(): void {
    this._saveOperation = undefined;
    this._deleteOperation = undefined;
    this._testOperation = undefined;
    this._saving = false;
    this._deleting = false;
    this._testing = false;
  }

  setConfig(config: CardConfig): void {
    const previousTaskId = this._config?.task_id;
    const legacyWidth = (config as CardConfig & { width?: "standard" | "wide" }).width;
    const cleanConfig = { ...config } as CardConfig & {
      width?: "standard" | "wide";
    };
    delete cleanConfig.width;
    const normalizedConfig: CardConfig = {
      ...DEFAULT_CARD_CONFIG,
      ...cleanConfig,
      vertical_size: config.vertical_size || legacyWidth || "standard",
    };
    this._config = normalizedConfig;

    if (!this._sessionInitialized) {
      if (this.isConnected) this.initializeTaskSession(normalizedConfig);
      return;
    }

    // HA echoes every config-changed event back through setConfig(). Rehydrate
    // the task draft only when the selected task actually changed externally;
    // presentation-only echoes must never overwrite unsaved task fields.
    if (previousTaskId === normalizedConfig.task_id) return;
    this._mutationEpoch += 1;
    this.invalidateTestOperation();
    if (!normalizedConfig.task_id) {
      this.rememberExistingDraft();
      this._taskMode = "new";
      this._existingTaskId = undefined;
      this._existingTaskDraftDirty = false;
      this._draft = this._newTaskDraftDirty
        ? cloneDraft(this._newTaskDraft)
        : newDraft(this.currentDateIso);
      return;
    }

    this._taskMode = "existing";
    this._existingTaskId = normalizedConfig.task_id;
    const selected = this._tasks.find((task) => task.task_id === normalizedConfig.task_id);
    if (selected) this.activateExistingTask(selected);
    else {
      this._existingTaskDraftDirty = false;
      this._draft = newDraft(this.currentDateIso);
    }
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && this._loadedConnection !== this.hass.connection) {
      if (this._loadedConnection) {
        this._mutationEpoch += 1;
        this.invalidatePendingOperations();
        this.retryUnavailableIconIndex();
      }
      this._loadedConnection = this.hass.connection;
      void this.load();
    }
    this.ensureIconIndexReady();
  }

  private async load(): Promise<void> {
    if (!this.hass) return;
    const loadEpoch = ++this._loadEpoch;
    this._loading = true;
    this._loadFailed = false;
    this._targetsLoadFailed = false;
    this._error = "";
    try {
      const [tasksResult, targetsResult] = await Promise.allSettled([
        this.hass.connection.sendMessagePromise<CountdownTask[]>({
          type: "cyclic_countdown/tasks/list",
        }),
        this.hass.connection.sendMessagePromise<NotificationTarget[]>({
          type: "cyclic_countdown/notification_targets/list",
        }),
      ]);
      if (loadEpoch !== this._loadEpoch) return;
      if (tasksResult.status === "rejected") throw tasksResult.reason;
      const tasks = tasksResult.value;
      this._tasks = tasks;
      if (targetsResult.status === "fulfilled") this._targets = targetsResult.value;
      else {
        this._targets = [];
        this._targetsLoadFailed = true;
      }
      if (!this._newTaskDraftDirty) {
        this._newTaskDraft = newDraft(this.currentDateIso);
        if (this._taskMode === "new") this._draft = cloneDraft(this._newTaskDraft);
      }
      const selected = tasks.find(
        (task) => task.task_id === (this._existingTaskId || this._config?.task_id),
      );
      if (selected && this._taskMode === "existing") {
        this.activateExistingTask(selected);
      } else if (this._taskMode === "existing") {
        this._existingTaskDraftDirty = false;
        this._draft = newDraft(this.currentDateIso);
      }
    } catch {
      if (loadEpoch !== this._loadEpoch) return;
      this._loadFailed = true;
      this._error = this.s.integrationNotLoaded;
    } finally {
      if (loadEpoch === this._loadEpoch) this._loading = false;
    }
  }

  private emitConfig(changes: Partial<CardConfig>): void {
    if (!this._config) return;
    const next = { ...this._config, ...changes } as Record<string, unknown>;
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete next[key];
    }
    this._config = next as unknown as CardConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: this._config },
      }),
    );
  }

  private selectVerticalSize(vertical_size: CardConfig["vertical_size"]): void {
    this.emitConfig({
      vertical_size,
      grid_options: {
        ...this._config?.grid_options,
        rows: vertical_size === "compact" ? 1 : vertical_size === "wide" ? 2 : "auto",
      },
    });
  }

  private selectTask(event: Event): void {
    const taskId = (event.target as HTMLSelectElement).value;
    if (!taskId) return;
    const task = this._tasks.find((item) => item.task_id === taskId);
    if (!task) return;
    this._mutationEpoch += 1;
    this.invalidateTestOperation();
    this.activateExistingTask(task);
    this.emitConfig({ task_id: taskId });
  }

  private selectTaskMode(mode: TaskMode): void {
    if (mode === this._taskMode) return;
    this._mutationEpoch += 1;
    this.invalidateTestOperation();
    this._error = "";
    this._notice = "";
    if (mode === "new") {
      this.rememberExistingDraft();
      this._taskMode = "new";
      this._existingTaskDraftDirty = false;
      if (!this._newTaskDraftDirty) this._newTaskDraft = newDraft(this.currentDateIso);
      this._draft = cloneDraft(this._newTaskDraft);
      this.emitConfig({ task_id: undefined });
      return;
    }
    this._newTaskDraft = cloneDraft(this._draft);
    this._taskMode = "existing";
    const selected = this._tasks.find((task) => task.task_id === this._existingTaskId)
      || this._tasks[0];
    if (selected) {
      this.activateExistingTask(selected);
      this.emitConfig({ task_id: selected.task_id });
    } else {
      this._taskMode = "new";
      this._existingTaskId = undefined;
      this._existingTaskDraftDirty = false;
      if (!this._newTaskDraftDirty) this._newTaskDraft = newDraft(this.currentDateIso);
      this._draft = cloneDraft(this._newTaskDraft);
      this.emitConfig({ task_id: undefined });
    }
  }

  private updateDraft(key: keyof Draft, value: unknown): void {
    this._mutationEpoch += 1;
    this.invalidateTestOperation();
    this._draft = { ...this._draft, [key]: value };
    if (this._taskMode === "new") {
      this._newTaskDraft = cloneDraft(this._draft);
      this._newTaskDraftDirty = true;
    } else if (this._draft.task_id) {
      this._existingTaskDraftDirty = true;
      this._existingDrafts.set(this._draft.task_id, {
        draft: cloneDraft(this._draft),
        dirty: true,
      });
    }
  }

  private input(key: keyof Draft, event: Event): void {
    this.updateDraft(key, (event.target as HTMLInputElement).value);
  }

  private numberInput(key: "interval_days" | "warning_days", event: Event): void {
    this.updateDraft(key, Number((event.target as HTMLInputElement).value));
  }

  private boolInput(key: keyof Draft, event: Event): void {
    this.updateDraft(key, (event.target as HTMLInputElement).checked);
  }

  private dueDate(): string {
    const start = dateOnlyValue(this.computedDueIso());
    if (!start) return "—";
    return new Intl.DateTimeFormat(this.locale, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }

  private computedDueIso(): string {
    if (this._draft.interval_days < 1) return "—";
    return addCalendarDays(this._draft.last_completed_date, this._draft.interval_days) || "—";
  }

  private payload(): Record<string, unknown> {
    const {
      name,
      icon,
      interval_days,
      last_completed_date,
      warning_days,
      notifications_enabled,
      persistent_notification_enabled,
      notification_targets,
      notification_title,
      notification_message,
      notify_on_warning,
      notify_on_due,
    } = this._draft;
    return {
      name,
      icon: normalizeIcon(icon),
      interval_days,
      last_completed_date,
      warning_days,
      notifications_enabled,
      persistent_notification_enabled,
      notification_targets,
      notification_title,
      notification_message,
      notify_on_warning,
      notify_on_due,
    };
  }

  private async saveTask(): Promise<void> {
    if (!this.hass || this._saving || this._deleting || this._testing) return;
    const connection = this.hass.connection;
    const mode = this._taskMode;
    const taskId = this._draft.task_id;
    const mutationEpoch = ++this._mutationEpoch;
    const operation = ++this._operationSerial;
    this._saveOperation = operation;
    if (taskId) this._taskServerMutationEpochs.set(taskId, mutationEpoch);
    const payload = this.payload();
    this._saving = true;
    this._error = "";
    this._notice = "";
    try {
      const result = await connection.sendMessagePromise<CountdownTask>({
        type: taskId ? "cyclic_countdown/tasks/update" : "cyclic_countdown/tasks/create",
        ...(taskId ? { task_id: taskId } : {}),
        ...payload,
      });
      if (
        this.hass?.connection === connection
        && (!taskId || this._taskServerMutationEpochs.get(taskId) === mutationEpoch)
      ) {
        const rest = this._tasks.filter((task) => task.task_id !== result.task_id);
        this._tasks = [...rest, result].sort((a, b) => a.name.localeCompare(b.name));
      }
      if (!this.mutationIsCurrent(mutationEpoch, connection, mode, taskId)) return;
      this._draft = cloneDraft(result);
      this._taskMode = "existing";
      this._existingTaskId = result.task_id;
      this._existingTaskDraftDirty = false;
      this._existingDrafts.set(result.task_id, {
        draft: cloneDraft(result),
        dirty: false,
      });
      this._newTaskDraft = newDraft(this.currentDateIso);
      this._newTaskDraftDirty = false;
      this.emitConfig({ task_id: result.task_id });
      this._notice = taskId ? this.s.changesSaved : this.s.taskCreated;
    } catch (error) {
      if (this.mutationIsCurrent(mutationEpoch, connection, mode, taskId)) {
        this._error = this.saveErrorMessage(error);
      }
    } finally {
      if (this._saveOperation === operation) {
        this._saveOperation = undefined;
        this._saving = false;
      }
    }
  }

  private saveErrorMessage(error: unknown): string {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
    if (message.toLowerCase().includes("icon")) return this.s.invalidIcon;
    return message || this.s.saveFailed;
  }

  private async deleteTask(): Promise<void> {
    if (
      !this.hass
      || !this._draft.task_id
      || this._saving
      || this._deleting
      || this._testing
    ) return;
    if (!window.confirm(this.s.deleteConfirm(this._draft.name))) return;
    const connection = this.hass.connection;
    const mode = this._taskMode;
    const deletedTaskId = this._draft.task_id;
    const mutationEpoch = ++this._mutationEpoch;
    const operation = ++this._operationSerial;
    this._deleteOperation = operation;
    this._taskServerMutationEpochs.set(deletedTaskId, mutationEpoch);
    this._deleting = true;
    try {
      await connection.sendMessagePromise({
        type: "cyclic_countdown/tasks/delete",
        task_id: deletedTaskId,
      });
      const deletionApplied = (
        this.hass?.connection === connection
        && this._taskServerMutationEpochs.get(deletedTaskId) === mutationEpoch
      );
      if (deletionApplied) {
        this._existingDrafts.delete(deletedTaskId);
        this._tasks = this._tasks.filter((task) => task.task_id !== deletedTaskId);
        this._taskServerMutationEpochs.delete(deletedTaskId);
      }
      if (
        deletionApplied
        && this.isConnected
        && this._taskMode === "existing"
        && this._draft.task_id === deletedTaskId
      ) {
        this.selectAfterDelete();
        this._notice = this.s.taskDeleted;
        return;
      }
      if (!this.mutationIsCurrent(mutationEpoch, connection, mode, deletedTaskId)) return;
      this.selectAfterDelete();
      this._notice = this.s.taskDeleted;
    } catch {
      if (this.mutationIsCurrent(mutationEpoch, connection, mode, deletedTaskId)) {
        this._error = this.s.deleteFailed;
      }
    } finally {
      if (this._deleteOperation === operation) {
        this._deleteOperation = undefined;
        this._deleting = false;
      }
    }
  }

  private selectAfterDelete(): void {
    const nextTask = this._tasks[0];
    if (nextTask) {
      this._taskMode = "new";
      this.activateExistingTask(nextTask);
      this.emitConfig({ task_id: nextTask.task_id });
      return;
    }
    this._taskMode = "new";
    this._existingTaskId = undefined;
    this._existingTaskDraftDirty = false;
    this._newTaskDraft = newDraft(this.currentDateIso);
    this._newTaskDraftDirty = false;
    this._draft = cloneDraft(this._newTaskDraft);
    this.emitConfig({ task_id: undefined });
  }

  private targetChanged(event: Event): void {
    const options = [...(event.target as HTMLSelectElement).selectedOptions];
    this.updateDraft("notification_targets", options.map((option) => option.value));
  }

  private async testNotification(): Promise<void> {
    if (
      !this.hass
      || this._saving
      || this._deleting
      || this._testing
      || this.draftInvalid
    ) return;
    const connection = this.hass.connection;
    const mode = this._taskMode;
    const taskId = this._draft.task_id;
    const mutationEpoch = this._mutationEpoch;
    const operation = ++this._operationSerial;
    const payload = this.payload();
    const targets = [...this._draft.notification_targets];
    this._testOperation = operation;
    this._testing = true;
    this._error = "";
    this._notice = "";
    try {
      const result = await connection.sendMessagePromise<{ delivered: string[]; failed: string[] }>({
        type: "cyclic_countdown/notifications/test",
        ...(taskId ? { task_id: taskId } : {}),
        ...payload,
        targets,
      });
      if (
        this._testOperation !== operation
        || !this.mutationIsCurrent(mutationEpoch, connection, mode, taskId)
      ) return;
      this._notice = this.s.testSent(result.delivered.length, result.failed.length);
    } catch {
      if (
        this._testOperation === operation
        && this.mutationIsCurrent(mutationEpoch, connection, mode, taskId)
      ) {
        this._error = this.s.testFailed;
      }
    } finally {
      if (this._testOperation === operation) {
        this._testOperation = undefined;
        this._testing = false;
      }
    }
  }

  private get previewTask(): CountdownTask {
    const computedDue = this.computedDueIso();
    const dueIso = computedDue === "—" ? this.currentDateIso : computedDue;
    const actualRemaining = calendarDayDifference(dueIso, this.currentDateIso) ?? 0;
    const remaining = this._previewPhase === "auto"
      ? actualRemaining
      : {
          normal: Math.max(this._draft.warning_days + 1, Math.ceil(this._draft.interval_days / 2)),
          warning: Math.max(1, this._draft.warning_days || 1),
          due: 0,
          overdue: -2,
        }[this._previewPhase];
    const phase = this._previewPhase === "auto"
      ? remaining < 0
        ? "overdue"
        : remaining === 0
          ? "due"
          : this._draft.warning_days > 0 && remaining <= this._draft.warning_days
            ? "warning"
            : "normal"
      : this._previewPhase;
    const interval = Math.max(1, this._draft.interval_days);
    return {
      ...this._draft,
      task_id: this._draft.task_id || "preview",
      name: this._draft.name || this.s.previewTaskName,
      due_date: dueIso,
      remaining_days: remaining,
      elapsed_progress: Math.min(1, Math.max(0, (interval - remaining) / interval)),
      phase,
      notification_targets: [...this._draft.notification_targets],
    };
  }

  private renderIconPicker() {
    if (this._iconPickerDefined && !this._iconIndexUnavailable) {
      return html`<ha-icon-picker
        .hass=${this.hass}
        .value=${this._draft.icon}
        .disabled=${!this._iconIndexReady}
        .invalid=${!ICON_PATTERN.test(this._draft.icon)}
        .errorMessage=${this.s.invalidIcon}
        aria-busy=${this._iconIndexReady ? "false" : "true"}
        @click=${this._iconPickerClickListener}
        @picker-opened=${this.refreshOpenIconPicker}
        @value-changed=${(event: CustomEvent<{ value: string }>) => this.updateDraft("icon", normalizeIcon(event.detail.value))}
      ></ha-icon-picker><small>${this._iconIndexReady ? this.s.iconHint : this.s.loadingIcons}</small>`;
    }
    return html`<input
      .value=${this._draft.icon}
      @change=${(event: Event) => this.updateDraft("icon", normalizeIcon((event.target as HTMLInputElement).value))}
      placeholder="mdi:wrench-clock"
    /><small>${this.s.iconHint}</small>`;
  }

  private openIconPickerWithoutPinnedValue(event: Event): void {
    const path = event.composedPath();
    const fieldClick = path.some(
      (target) => target instanceof HTMLElement && target.localName === "ha-picker-field",
    );
    const clearClick = path.some(
      (target) => target instanceof HTMLElement && target.classList.contains("clear"),
    );
    if (!fieldClick || clearClick || !this._iconIndexReady) return;

    const picker = event.currentTarget as HTMLElement;
    const generic = picker.shadowRoot?.querySelector<GenericIconPickerElement>("ha-generic-picker");
    if (!generic?.open || generic.disabled) return;

    // HA pins the virtualized list to the currently selected icon on first
    // open. In the mobile bottom sheet that initial pin can race the list
    // layout and leave a stale/empty search snapshot. Keep the field value
    // intact, but open the native picker without an initial pinned value.
    event.preventDefault();
    event.stopPropagation();
    void generic.open(undefined, { selectedValue: "" });
  }

  private readonly refreshOpenIconPicker = async (event: Event): Promise<void> => {
    const picker = event.currentTarget as HTMLElement;
    const generic = picker.shadowRoot?.querySelector<GenericIconPickerElement>("ha-generic-picker");
    if (!generic) return;
    await (generic.updateComplete ?? Promise.resolve());
    generic.refreshItems?.();
  };

  private ensureIconIndexReady(): void {
    if (
      !this._iconPickerDefined
      || this._iconIndexReady
      || this._iconIndexUnavailable
      || this._iconIndexTimer !== undefined
      || this._loading
      || this._loadFailed
      || !this.hasEditableTask
    ) return;

    const picker = this.shadowRoot?.querySelector("ha-icon-picker");
    if (!picker) return;
    this._iconIndexWaitStarted ??= performance.now();

    const generic = picker.shadowRoot?.querySelector<GenericIconPickerElement>("ha-generic-picker");
    const items = generic?.getItems?.();
    if (items?.some((item) => item?.id === ICON_INDEX_SENTINEL)) {
      this._iconIndexReady = true;
      this._iconIndexWaitStarted = undefined;
      return;
    }

    if (performance.now() - this._iconIndexWaitStarted >= ICON_INDEX_TIMEOUT_MS) {
      // The native index failed to load. Keep icon editing functional instead
      // of leaving a permanently disabled Home Assistant picker on screen.
      this._iconIndexUnavailable = true;
      this._iconIndexWaitStarted = undefined;
      return;
    }

    this._iconIndexTimer = window.setTimeout(() => {
      this._iconIndexTimer = undefined;
      this.ensureIconIndexReady();
    }, ICON_INDEX_POLL_MS);
  }

  private stopIconIndexProbe(): void {
    if (this._iconIndexTimer !== undefined) window.clearTimeout(this._iconIndexTimer);
    this._iconIndexTimer = undefined;
    this._iconIndexWaitStarted = undefined;
  }

  private retryUnavailableIconIndex(): void {
    if (!this._iconIndexUnavailable) return;
    this.stopIconIndexProbe();
    this._iconIndexUnavailable = false;
    this._iconIndexReady = false;
  }

  private renderTaskSelector() {
    const selectedId = this._existingTaskId || this._config?.task_id;
    const modePicker = html`
      <div class="task-mode-picker" role="tablist" aria-label=${this.s.taskMode}>
        <button
          role="tab"
          class=${this._taskMode === "new" ? "selected" : ""}
          aria-selected=${this._taskMode === "new" ? "true" : "false"}
          @click=${() => this.selectTaskMode("new")}
        ><ha-icon icon="mdi:plus"></ha-icon>${this.s.createNewTask}</button>
        <button
          role="tab"
          class=${this._taskMode === "existing" ? "selected" : ""}
          aria-selected=${this._taskMode === "existing" ? "true" : "false"}
          ?disabled=${!this._tasks.length}
          @click=${() => this.selectTaskMode("existing")}
        ><ha-icon icon="mdi:format-list-bulleted"></ha-icon>${this.s.existingTask}</button>
      </div>
    `;
    if (this._taskMode === "new") return modePicker;
    const selectedExists = this._tasks.some((task) => task.task_id === selectedId);
    return html`${modePicker}<label>${this.s.selectedTask}
      <select @change=${this.selectTask} .value=${selectedId || ""}>
        ${!selectedId
          ? html`<option value="" disabled>${this.s.chooseTask}</option>`
          : !selectedExists
            ? html`<option value=${selectedId} disabled>${this.s.missingTask}</option>`
            : nothing}
        ${this._tasks.map((task) => html`<option value=${task.task_id}>${task.name}</option>`)}
      </select>
    </label>`;
  }

  private targetLabel(target: NotificationTarget): string {
    return target.kind === "legacy_service"
      ? this.s.compatibilityTarget(target.name, target.id)
      : target.name;
  }

  private renderActionSelect(
    label: string,
    key: "tap_action" | "hold_action" | "double_tap_action",
  ) {
    return html`<label>${label}<select
      .value=${this._config?.[key] || "none"}
      @change=${(event: Event) => this.emitConfig({
        [key]: (event.target as HTMLSelectElement).value,
      } as Partial<CardConfig>)}
    ><option value="complete">${this.s.complete}</option><option value="more-info">${this.s.moreInfo}</option><option value="none">${this.s.noAction}</option></select></label>`;
  }

  render() {
    if (!this._config) return nothing;
    if (this._loading) return html`<div class="status">${this.s.loading}</div>`;
    if (this._loadFailed) return html`<div class="integration-error">${this._error}<button @click=${this.load}>${this.s.retry}</button></div>`;
    return html`
      ${this._error ? html`<div class="message error" role="alert">${this._error}</div>` : nothing}
      ${this._notice ? html`<div class="message notice" role="status">${this._notice}</div>` : nothing}

      <section>
        <h3><ha-icon icon="mdi:calendar-sync"></ha-icon>${this.s.task}</h3>
        ${this.renderTaskSelector()}
        ${this.hasEditableTask ? html`<div class="grid">
          <label>${this.s.name}<input required maxlength="128" .value=${this._draft.name} @input=${(event: Event) => this.input("name", event)} placeholder=${this.s.namePlaceholder} /></label>
          <label>${this.s.icon}${this.renderIconPicker()}</label>
          <label>${this.s.intervalDays}<input type="number" min="1" max="3650" .value=${String(this._draft.interval_days)} @input=${(event: Event) => this.numberInput("interval_days", event)} /></label>
          <label>${this.s.lastCompleted}<span class="inline-field"><input type="date" .value=${this._draft.last_completed_date} @input=${(event: Event) => this.input("last_completed_date", event)} /><button @click=${() => this.updateDraft("last_completed_date", this.currentDateIso)}>${this.s.today}</button></span></label>
          <label>${this.s.warningWindow}<input type="number" min="0" .max=${String(this._draft.interval_days)} .value=${String(this._draft.warning_days)} @input=${(event: Event) => this.numberInput("warning_days", event)} /></label>
          <div class="due-preview"><span>${this.s.nextDueDate}</span><strong>${this.dueDate()}</strong></div>
        </div>` : html`<div class="task-empty">${this.s.selectTaskFirst}</div>`}
      </section>

      <section>
        <h3><ha-icon icon="mdi:palette-outline"></ha-icon>${this.s.appearance}</h3>
        <div class="style-picker" role="radiogroup" aria-label=${this.s.styleAria}>
          ${(["bar", "fill"] as const).map((style) => html`
            <button class="style-option ${this._config?.style === style ? "selected" : ""}" @click=${() => this.emitConfig({ style })}>
              <span class="mini ${style}"><i></i><b></b><em></em></span>${style === "bar" ? this.s.bar : this.s.cardFill}
            </button>`)}
        </div>
        <div class="size-field"><span>${this.s.verticalSize}</span>
          <span class="size-picker" role="radiogroup" aria-label=${this.s.verticalSizeAria}>
            ${(["compact", "standard", "wide"] as const).map((vertical_size) => html`<button
              class=${this._config?.vertical_size === vertical_size ? "selected" : ""}
              @click=${() => this.selectVerticalSize(vertical_size)}
              aria-pressed=${this._config?.vertical_size === vertical_size ? "true" : "false"}
            >${vertical_size === "compact" ? this.s.compactSize : vertical_size === "standard" ? this.s.standardSize : this.s.wideSize}</button>`)}
          </span>
        </div>
        <div class="grid">
          <label class="toggle"><input type="checkbox" .checked=${this._config.reverse_progress} @change=${(event: Event) => this.emitConfig({ reverse_progress: (event.target as HTMLInputElement).checked })} /><span>${this.s.reverseProgress}</span></label>
          <label>${this.s.accentColor}<span class="inline-field"><input type="color" .value=${this._config.accent_color || "#6d78e8"} @input=${(event: Event) => this.emitConfig({ accent_color: (event.target as HTMLInputElement).value })} /><button @click=${() => this.emitConfig({ accent_color: undefined })}>${this.s.themeColor}</button></span></label>
          <label class="toggle"><input type="checkbox" .checked=${this._config.show_secondary} @change=${(event: Event) => this.emitConfig({ show_secondary: (event.target as HTMLInputElement).checked })} /><span>${this.s.showSecondary}</span></label>
          <label>${this.s.secondaryLine}<select .value=${this._config.secondary_info} @change=${(event: Event) => this.emitConfig({ secondary_info: (event.target as HTMLSelectElement).value as CardConfig["secondary_info"] })}><option value="last_completed">${this.s.lastCompleted}</option><option value="due_date">${this.s.dueDate}</option></select></label>
        </div>
        <div class="preview-toolbar"><span>${this.s.livePreview}</span><select .value=${this._previewPhase} @change=${(event: Event) => { this._previewPhase = (event.target as HTMLSelectElement).value as PreviewPhase; }}><option value="auto">${this.s.previewAuto}</option><option value="normal">${this.s.previewNormal}</option><option value="warning">${this.s.previewWarning}</option><option value="due">${this.s.previewDue}</option><option value="overdue">${this.s.previewOverdue}</option></select></div>
        ${this.hasEditableTask
          ? html`<cyclic-countdown-card .hass=${this.hass} .previewTask=${this.previewTask} ._config=${this._config}></cyclic-countdown-card>`
          : html`<div class="task-empty">${this.s.selectTaskFirst}</div>`}
      </section>

      ${this.hasEditableTask ? html`<section>
        <h3><ha-icon icon="mdi:gesture-tap"></ha-icon>${this.s.behavior}</h3>
        <div class="grid">
          <label class="toggle"><input type="checkbox" .checked=${this._config.confirm_complete} @change=${(event: Event) => this.emitConfig({ confirm_complete: (event.target as HTMLInputElement).checked })} /><span>${this.s.confirmCompletion}</span></label>
          ${this.renderActionSelect(this.s.tap, "tap_action")}
          ${this.renderActionSelect(this.s.hold, "hold_action")}
          ${this.renderActionSelect(this.s.doubleTap, "double_tap_action")}
        </div>
      </section>

      <section>
        <h3><ha-icon icon="mdi:bell-outline"></ha-icon>${this.s.notifications}</h3>
        <label class="toggle"><input type="checkbox" .checked=${this._draft.notifications_enabled} @change=${(event: Event) => this.boolInput("notifications_enabled", event)} /><span>${this.s.sendNotifications}</span></label>
        ${this._targetsLoadFailed
          ? html`<div class="section-message" role="status">${this.s.notificationTargetsUnavailable}</div>`
          : nothing}
        ${this._draft.notifications_enabled ? html`
          <label>${this.s.notificationTargets}<select multiple size="${Math.min(6, Math.max(3, this.visibleTargets.length))}" @change=${this.targetChanged}>${this.visibleTargets.map((target) => html`<option value=${target.id} ?selected=${this._draft.notification_targets.includes(target.id)}>${this.targetLabel(target)}${target.available ? "" : this.s.unavailable}</option>`)}</select></label>
          <div class="grid">
            <label>${this.s.optionalTitle}<input .value=${this._draft.notification_title} @input=${(event: Event) => this.input("notification_title", event)} /></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.persistent_notification_enabled} @change=${(event: Event) => this.boolInput("persistent_notification_enabled", event)} /><span>${this.s.persistentNotification}</span></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.notify_on_warning} @change=${(event: Event) => this.boolInput("notify_on_warning", event)} /><span>${this.s.onWarning}</span></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.notify_on_due} @change=${(event: Event) => this.boolInput("notify_on_due", event)} /><span>${this.s.onDue}</span></label>
          </div>
          <label>${this.s.message}<textarea required .value=${this._draft.notification_message} @input=${(event: Event) => this.input("notification_message", event)}></textarea><small>${this.s.placeholders}: {name}, {days}, {due_date}</small></label>
          <div class="notification-preview"><span>${this._draft.notification_title || this.s.notification}</span><p>${this._draft.notification_message.replaceAll("{name}", this._draft.name || this.s.previewTaskName).replaceAll("{days}", String(this.previewTask.remaining_days)).replaceAll("{due_date}", this.computedDueIso() === "—" ? this.currentDateIso : this.computedDueIso())}</p></div>
          <button class="ghost" ?disabled=${this._saving || this._deleting || this._testing || this.draftInvalid} @click=${this.testNotification}>${this.s.sendTest}</button>
        ` : nothing}
      </section>` : nothing}

      ${this.hasEditableTask ? html`<footer>
        ${this._draft.task_id ? html`<button class="danger" ?disabled=${this._saving || this._deleting || this._testing} @click=${this.deleteTask}>${this.s.deleteTask}</button>` : html`<span></span>`}
        ${this._config.task_id && !this._draft.task_id
          ? nothing
          : html`<button class="save" ?disabled=${this.saveDisabled} @click=${this.saveTask}>${this._saving ? this.s.saving : this._draft.task_id ? this.s.saveTask : this.s.createTask}</button>`}
      </footer>
      <small class="task-save-hint">${this.s.taskSaveHint}</small>` : nothing}
    `;
  }

  static styles = css`
    :host { display: block; color: var(--primary-text-color); font-family: var(--ha-font-family-body, inherit); }
    section { margin: 0 0 16px; padding: 16px; border: 1px solid var(--divider-color, rgba(127,127,127,.22)); border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, transparent) 42%, transparent); }
    h3 { margin: 0 0 16px; display: flex; align-items: center; gap: 9px; font-size: 17px; }
    h3 ha-icon { color: var(--primary-color); --mdc-icon-size: 21px; }
    .task-mode-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 14px; }
    .task-mode-picker button { display: flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--divider-color); background: var(--card-background-color); }
    .task-mode-picker button.selected { border-color: var(--primary-color); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); }
    .task-mode-picker ha-icon { --mdc-icon-size: 18px; }
    .task-empty { margin: 8px 0 14px; padding: 14px; border: 1px dashed var(--divider-color); border-radius: 12px; color: var(--secondary-text-color); text-align: center; font-size: 13px; }
    label { display: flex; flex-direction: column; gap: 7px; margin: 0 0 13px; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
    input, select, textarea { box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--divider-color, #888); border-radius: 12px; color: var(--primary-text-color); background: var(--card-background-color, #fff); font: inherit; font-size: 14px; }
    input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    input[type="color"] { padding: 5px; }
    input[type="checkbox"] { appearance: none; -webkit-appearance: none; flex: 0 0 20px; width: 20px; height: 20px; min-height: 20px; padding: 0; border: 2px solid color-mix(in srgb, var(--secondary-text-color, #777) 72%, transparent); border-radius: 5px; background: transparent; display: grid; place-content: center; cursor: pointer; }
    input[type="checkbox"]::before { content: ""; width: 10px; height: 6px; border: solid var(--text-primary-color, #fff); border-width: 0 0 2px 2px; transform: rotate(-45deg) scale(0); transform-origin: center; transition: transform 120ms ease-out; }
    input[type="checkbox"]:checked { border-color: var(--primary-color); background: var(--primary-color); }
    input[type="checkbox"]:checked::before { transform: rotate(-45deg) scale(1); }
    select[multiple] { min-height: 92px; }
    textarea { min-height: 88px; resize: vertical; }
    small { font-weight: 400; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
    .toggle { min-height: 44px; flex-direction: row; align-items: center; gap: 10px; color: var(--primary-text-color); font-size: 14px; }
    .inline-field { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .inline-field button { white-space: nowrap; font-size: 12px; }
    .due-preview { min-height: 44px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 12px; border-left: 3px solid var(--primary-color); }
    .due-preview span { color: var(--secondary-text-color); font-size: 11px; }
    .due-preview strong { font-size: 13px; }
    .style-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    .size-field { display: flex; flex-direction: column; gap: 7px; margin: 0 0 13px; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
    .size-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .size-picker button { min-height: 40px; padding: 8px 6px; display: flex; align-items: center; justify-content: center; text-align: center; border: 1px solid var(--divider-color); font-size: 13px; line-height: 1.2; }
    .size-picker button.selected { border-color: var(--primary-color); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); }
    button { min-height: 44px; border: 0; border-radius: 12px; padding: 9px 14px; font: inherit; font-weight: 650; cursor: pointer; color: var(--primary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
    button:disabled { opacity: .48; cursor: default; }
    .style-option { min-height: 88px; display: flex; flex-direction: column; gap: 8px; align-items: stretch; font-size: 12px; border: 2px solid transparent; }
    .style-option.selected { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background-color)); }
    .mini { position: relative; height: 40px; overflow: hidden; border-radius: 12px; background: var(--card-background-color); border: 1px solid var(--divider-color); }
    .mini i { position: absolute; left: 6px; top: 6px; width: 28px; height: 28px; border-radius: 9px; background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .mini b { position: absolute; left: 42px; top: 10px; right: 28px; height: 6px; border-radius: 4px; background: var(--primary-text-color); opacity: .78; }
    .mini em { position: absolute; right: 7px; top: 8px; width: 16px; height: 14px; border-radius: 4px; background: var(--primary-text-color); opacity: .62; }
    .mini.bar::after { content: ""; position: absolute; left: 42px; bottom: 9px; right: 30px; height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--primary-color) 65%, var(--divider-color) 65%); }
    .mini.fill::after { content: ""; position: absolute; inset: 0 44% 0 0; background: color-mix(in srgb, var(--primary-color) 13%, transparent); }
    .preview-toolbar { margin: 4px 0 9px; display: flex; align-items: center; justify-content: space-between; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
    .preview-toolbar select { width: auto; min-height: 36px; padding: 6px 10px; }
    cyclic-countdown-card { display: block; pointer-events: none; }
    .notification-preview { margin: 6px 0 12px; padding: 12px 14px; border-radius: 14px; background: var(--card-background-color); border: 1px solid var(--divider-color); }
    .notification-preview span { font-weight: 700; }
    .notification-preview p { margin: 5px 0 0; color: var(--secondary-text-color); font-size: 13px; }
    footer { position: sticky; bottom: 0; z-index: 5; display: flex; justify-content: space-between; gap: 12px; padding: 13px 0 4px; background: var(--card-background-color); }
    .task-save-hint { display: block; margin-top: 6px; color: var(--secondary-text-color); text-align: end; }
    .save { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    .danger { color: var(--error-color, #d85f58); }
    .ghost { border: 1px solid var(--divider-color); background: transparent; }
    .message, .integration-error, .status { margin-bottom: 14px; padding: 13px 15px; border-radius: 13px; font-size: 13px; }
    .message.error, .integration-error { background: color-mix(in srgb, var(--error-color, #d85f58) 14%, transparent); }
    .message.notice { background: color-mix(in srgb, var(--success-color, #43a66d) 14%, transparent); }
    .section-message { margin: 0 0 13px; padding: 10px 12px; border-radius: 10px; color: var(--secondary-text-color); background: color-mix(in srgb, var(--warning-color, #e5a83b) 10%, transparent); font-size: 12px; line-height: 1.4; }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } .style-picker { grid-template-columns: 1fr; } footer { flex-wrap: wrap; } footer button { flex: 1; } }
  `;
}

if (!customElements.get("cyclic-countdown-editor")) {
  customElements.define("cyclic-countdown-editor", CyclicCountdownEditor);
}
