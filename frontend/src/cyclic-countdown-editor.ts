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

type Draft = Omit<CountdownTask, "task_id" | "cycle_id"> & { task_id?: string };

const DEFAULT_CARD_CONFIG: CardConfig = {
  type: "custom:cyclic-countdown-card",
  style: "bar",
  width: "standard",
  reverse_progress: false,
  confirm_complete: true,
  show_secondary: true,
  secondary_info: "last_completed",
  tap_action: "more-info",
  hold_action: "complete",
  double_tap_action: "none",
};

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
};

const newDraft = (): Draft => ({
  name: "",
  icon: "mdi:wrench-clock",
  interval_days: 14,
  last_completed_date: todayIso(),
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
    _error: { state: true },
    _notice: { state: true },
    _loadFailed: { state: true },
  };

  hass?: HomeAssistant;
  private _config?: CardConfig;
  private _tasks: CountdownTask[] = [];
  private _targets: NotificationTarget[] = [];
  private _draft: Draft = newDraft();
  private _previewPhase: PreviewPhase = "auto";
  private _loading = true;
  private _saving = false;
  private _error = "";
  private _notice = "";
  private _loadFailed = false;
  private _loadedConnection?: HomeAssistant["connection"];

  private get locale(): string {
    return this.hass?.locale?.language || this.hass?.language || navigator.language;
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

  private get saveDisabled(): boolean {
    return (
      this._saving ||
      !this._draft.name.trim() ||
      this._draft.interval_days < 1 ||
      this._draft.warning_days < 0 ||
      this._draft.warning_days > this._draft.interval_days ||
      (this._draft.notifications_enabled && !this._draft.notification_message.trim())
    );
  }

  setConfig(config: CardConfig): void {
    this._config = { ...DEFAULT_CARD_CONFIG, ...config };
    const selected = this._tasks.find((task) => task.task_id === config.task_id);
    if (selected) this._draft = { ...selected, notification_targets: [...selected.notification_targets] };
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && this._loadedConnection !== this.hass.connection) {
      this._loadedConnection = this.hass.connection;
      void this.load();
    }
  }

  private async load(): Promise<void> {
    if (!this.hass) return;
    this._loading = true;
    this._loadFailed = false;
    this._error = "";
    try {
      const [tasks, targets] = await Promise.all([
        this.hass.connection.sendMessagePromise<CountdownTask[]>({
          type: "cyclic_countdown/tasks/list",
        }),
        this.hass.connection.sendMessagePromise<NotificationTarget[]>({
          type: "cyclic_countdown/notification_targets/list",
        }),
      ]);
      this._tasks = tasks;
      this._targets = targets;
      const selected = tasks.find((task) => task.task_id === this._config?.task_id);
      if (selected) this._draft = { ...selected, notification_targets: [...selected.notification_targets] };
    } catch {
      this._loadFailed = true;
      this._error = this.s.integrationNotLoaded;
    } finally {
      this._loading = false;
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

  private selectTask(event: Event): void {
    const taskId = (event.target as HTMLSelectElement).value;
    if (taskId === "__new") {
      this._draft = newDraft();
      this.emitConfig({ task_id: undefined });
      return;
    }
    const task = this._tasks.find((item) => item.task_id === taskId);
    if (!task) return;
    this._draft = { ...task, notification_targets: [...task.notification_targets] };
    this.emitConfig({ task_id: taskId });
  }

  private updateDraft(key: keyof Draft, value: unknown): void {
    this._draft = { ...this._draft, [key]: value };
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
    const start = new Date(`${this.computedDueIso()}T12:00:00`);
    if (Number.isNaN(start.getTime())) return "—";
    return new Intl.DateTimeFormat(this.hass?.language || "ru", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(start);
  }

  private computedDueIso(): string {
    const start = new Date(`${this._draft.last_completed_date}T12:00:00`);
    if (Number.isNaN(start.getTime()) || this._draft.interval_days < 1) return "—";
    start.setDate(start.getDate() + this._draft.interval_days);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
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
    };
  }

  private async saveTask(): Promise<void> {
    if (!this.hass || this._saving) return;
    this._saving = true;
    this._error = "";
    this._notice = "";
    try {
      const existing = this._draft.task_id;
      const result = await this.hass.connection.sendMessagePromise<CountdownTask>({
        type: existing ? "cyclic_countdown/tasks/update" : "cyclic_countdown/tasks/create",
        ...(existing ? { task_id: existing } : {}),
        ...this.payload(),
      });
      const rest = this._tasks.filter((task) => task.task_id !== result.task_id);
      this._tasks = [...rest, result].sort((a, b) => a.name.localeCompare(b.name));
      this._draft = { ...result, notification_targets: [...result.notification_targets] };
      this.emitConfig({ task_id: result.task_id });
      this._notice = existing ? this.s.changesSaved : this.s.taskCreated;
    } catch (error) {
      this._error = error instanceof Error ? error.message : this.s.saveFailed;
    } finally {
      this._saving = false;
    }
  }

  private async deleteTask(): Promise<void> {
    if (!this.hass || !this._draft.task_id) return;
    if (!window.confirm(this.s.deleteConfirm(this._draft.name))) return;
    try {
      await this.hass.connection.sendMessagePromise({
        type: "cyclic_countdown/tasks/delete",
        task_id: this._draft.task_id,
      });
      this._tasks = this._tasks.filter((task) => task.task_id !== this._draft.task_id);
      this._draft = newDraft();
      this.emitConfig({ task_id: undefined });
      this._notice = this.s.taskDeleted;
    } catch {
      this._error = this.s.deleteFailed;
    }
  }

  private targetChanged(event: Event): void {
    const options = [...(event.target as HTMLSelectElement).selectedOptions];
    this.updateDraft("notification_targets", options.map((option) => option.value));
  }

  private async testNotification(): Promise<void> {
    if (!this.hass || !this._draft.task_id) {
      this._error = this.s.saveFirst;
      return;
    }
    this._error = "";
    try {
      const result = await this.hass.connection.sendMessagePromise<{ delivered: string[]; failed: string[] }>({
        type: "cyclic_countdown/notifications/test",
        task_id: this._draft.task_id,
        targets: this._draft.notification_targets,
      });
      this._notice = this.s.testSent(result.delivered.length, result.failed.length);
    } catch {
      this._error = this.s.testFailed;
    }
  }

  private get previewTask(): CountdownTask {
    const dueIso = this.computedDueIso() === "—" ? todayIso() : this.computedDueIso();
    const due = new Date(`${dueIso}T12:00:00`);
    const today = new Date(`${todayIso()}T12:00:00`);
    const actualRemaining = Math.round((due.getTime() - today.getTime()) / 86_400_000);
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
    if (customElements.get("ha-icon-picker")) {
      return html`<ha-icon-picker
        .hass=${this.hass}
        .value=${this._draft.icon}
        @value-changed=${(event: CustomEvent<{ value: string }>) => this.updateDraft("icon", event.detail.value)}
      ></ha-icon-picker>`;
    }
    return html`<input value=${this._draft.icon} @input=${(event: Event) => this.input("icon", event)} placeholder="mdi:wrench-clock" />`;
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
        <label>${this.s.selectedTask}
          <select @change=${this.selectTask} .value=${this._config.task_id || "__new"}>
            <option value="__new">＋ ${this.s.createNewTask}</option>
            ${this._tasks.map((task) => html`<option value=${task.task_id}>${task.name}</option>`)}
          </select>
        </label>
        <div class="grid">
          <label>${this.s.name}<input required maxlength="128" .value=${this._draft.name} @input=${(event: Event) => this.input("name", event)} placeholder=${this.s.namePlaceholder} /></label>
          <label>${this.s.icon}${this.renderIconPicker()}</label>
          <label>${this.s.intervalDays}<input type="number" min="1" max="3650" .value=${String(this._draft.interval_days)} @input=${(event: Event) => this.numberInput("interval_days", event)} /></label>
          <label>${this.s.lastCompleted}<span class="inline-field"><input type="date" .value=${this._draft.last_completed_date} @input=${(event: Event) => this.input("last_completed_date", event)} /><button @click=${() => this.updateDraft("last_completed_date", todayIso())}>${this.s.today}</button></span></label>
          <label>${this.s.warningWindow}<input type="number" min="0" .max=${String(this._draft.interval_days)} .value=${String(this._draft.warning_days)} @input=${(event: Event) => this.numberInput("warning_days", event)} /></label>
          <div class="due-preview"><span>${this.s.nextDueDate}</span><strong>${this.dueDate()}</strong></div>
        </div>
      </section>

      <section>
        <h3><ha-icon icon="mdi:palette-outline"></ha-icon>${this.s.appearance}</h3>
        <div class="style-picker" role="radiogroup" aria-label=${this.s.styleAria}>
          ${(["bar", "fill"] as const).map((style) => html`
            <button class="style-option ${this._config?.style === style ? "selected" : ""}" @click=${() => this.emitConfig({ style })}>
              <span class="mini ${style}"><i></i><b></b><em></em></span>${style === "bar" ? this.s.bar : this.s.cardFill}
            </button>`)}
        </div>
        <div class="width-field"><span>${this.s.width}</span>
          <span class="width-picker" role="radiogroup" aria-label=${this.s.widthAria}>
            ${(["standard", "wide"] as const).map((width) => html`<button
              class=${this._config?.width === width ? "selected" : ""}
              @click=${() => this.emitConfig({ width })}
              aria-pressed=${this._config?.width === width ? "true" : "false"}
            >${width === "standard" ? this.s.standardWidth : this.s.wideWidth}</button>`)}
          </span>
        </div>
        <div class="grid">
          <label class="toggle"><input type="checkbox" .checked=${this._config.reverse_progress} @change=${(event: Event) => this.emitConfig({ reverse_progress: (event.target as HTMLInputElement).checked })} /><span>${this.s.reverseProgress}</span></label>
          <label>${this.s.accentColor}<span class="inline-field"><input type="color" .value=${this._config.accent_color || "#6d78e8"} @input=${(event: Event) => this.emitConfig({ accent_color: (event.target as HTMLInputElement).value })} /><button @click=${() => this.emitConfig({ accent_color: undefined })}>${this.s.themeColor}</button></span></label>
          <label class="toggle"><input type="checkbox" .checked=${this._config.show_secondary} @change=${(event: Event) => this.emitConfig({ show_secondary: (event.target as HTMLInputElement).checked })} /><span>${this.s.showSecondary}</span></label>
          <label>${this.s.secondaryLine}<select .value=${this._config.secondary_info} @change=${(event: Event) => this.emitConfig({ secondary_info: (event.target as HTMLSelectElement).value as CardConfig["secondary_info"] })}><option value="last_completed">${this.s.lastCompleted}</option><option value="due_date">${this.s.dueDate}</option></select></label>
        </div>
        <div class="preview-toolbar"><span>${this.s.livePreview}</span><select .value=${this._previewPhase} @change=${(event: Event) => { this._previewPhase = (event.target as HTMLSelectElement).value as PreviewPhase; }}><option value="auto">${this.s.previewAuto}</option><option value="normal">${this.s.previewNormal}</option><option value="warning">${this.s.previewWarning}</option><option value="due">${this.s.previewDue}</option><option value="overdue">${this.s.previewOverdue}</option></select></div>
        <cyclic-countdown-card .hass=${this.hass} .previewTask=${this.previewTask} ._config=${this._config}></cyclic-countdown-card>
      </section>

      <section>
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
        ${this._draft.notifications_enabled ? html`
          <label>${this.s.notificationTargets}<select multiple size="${Math.min(6, Math.max(3, this.visibleTargets.length))}" @change=${this.targetChanged}>${this.visibleTargets.map((target) => html`<option value=${target.id} ?selected=${this._draft.notification_targets.includes(target.id)}>${target.name}${target.available ? "" : this.s.unavailable}</option>`)}</select></label>
          <div class="grid">
            <label>${this.s.optionalTitle}<input .value=${this._draft.notification_title} @input=${(event: Event) => this.input("notification_title", event)} /></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.persistent_notification_enabled} @change=${(event: Event) => this.boolInput("persistent_notification_enabled", event)} /><span>${this.s.persistentNotification}</span></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.notify_on_warning} @change=${(event: Event) => this.boolInput("notify_on_warning", event)} /><span>${this.s.onWarning}</span></label>
            <label class="toggle"><input type="checkbox" .checked=${this._draft.notify_on_due} @change=${(event: Event) => this.boolInput("notify_on_due", event)} /><span>${this.s.onDue}</span></label>
          </div>
          <label>${this.s.message}<textarea required .value=${this._draft.notification_message} @input=${(event: Event) => this.input("notification_message", event)}></textarea><small>${this.s.placeholders}: {name}, {days}, {due_date}</small></label>
          <div class="notification-preview"><span>${this._draft.notification_title || this.s.notification}</span><p>${this._draft.notification_message.replaceAll("{name}", this._draft.name || this.s.previewTaskName).replaceAll("{days}", String(this.previewTask.remaining_days)).replaceAll("{due_date}", this.computedDueIso() === "—" ? todayIso() : this.computedDueIso())}</p></div>
          <button class="ghost" @click=${this.testNotification}>${this.s.sendTest}</button>
        ` : nothing}
      </section>

      <footer>
        ${this._draft.task_id ? html`<button class="danger" @click=${this.deleteTask}>${this.s.deleteTask}</button>` : html`<span></span>`}
        <button class="save" ?disabled=${this.saveDisabled} @click=${this.saveTask}>${this._saving ? this.s.saving : this._draft.task_id ? this.s.saveTask : this.s.createTask}</button>
      </footer>
    `;
  }

  static styles = css`
    :host { display: block; color: var(--primary-text-color); font-family: var(--ha-font-family-body, inherit); }
    section { margin: 0 0 16px; padding: 16px; border: 1px solid var(--divider-color, rgba(127,127,127,.22)); border-radius: 18px; background: color-mix(in srgb, var(--secondary-background-color, transparent) 42%, transparent); }
    h3 { margin: 0 0 16px; display: flex; align-items: center; gap: 9px; font-size: 17px; }
    h3 ha-icon { color: var(--primary-color); --mdc-icon-size: 21px; }
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
    .width-field { display: flex; flex-direction: column; gap: 7px; margin: 0 0 13px; color: var(--secondary-text-color); font-size: 12px; font-weight: 650; }
    .width-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .width-picker button { min-height: 40px; border: 1px solid var(--divider-color); font-size: 13px; }
    .width-picker button.selected { border-color: var(--primary-color); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); }
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
    .save { background: var(--primary-color); color: var(--text-primary-color, #fff); }
    .danger { color: var(--error-color, #d85f58); }
    .ghost { border: 1px solid var(--divider-color); background: transparent; }
    .message, .integration-error, .status { margin-bottom: 14px; padding: 13px 15px; border-radius: 13px; font-size: 13px; }
    .message.error, .integration-error { background: color-mix(in srgb, var(--error-color, #d85f58) 14%, transparent); }
    .message.notice { background: color-mix(in srgb, var(--success-color, #43a66d) 14%, transparent); }
    @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } .style-picker { grid-template-columns: 1fr; } footer { flex-wrap: wrap; } footer button { flex: 1; } }
  `;
}

if (!customElements.get("cyclic-countdown-editor")) {
  customElements.define("cyclic-countdown-editor", CyclicCountdownEditor);
}
