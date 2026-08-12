import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";

import "./cyclic-countdown-editor";
import { dayUnit, formatDate, phaseLabel, t } from "./localize/localize";
import type {
  CardAction,
  CardConfig,
  CountdownTask,
  HassEntity,
  HomeAssistant,
} from "./models/types";
import { addCalendarDays, todayIsoInTimeZone } from "./utils/calendar";

const DEFAULT_OPTIONS: Omit<CardConfig, "type"> = {
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

const DEFAULT_CONFIG: CardConfig = {
  type: "custom:cyclic-countdown-card",
  ...DEFAULT_OPTIONS,
};

export class CyclicCountdownCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    previewTask: { attribute: false },
    _config: { state: true },
    _optimisticTask: { state: true },
    _confirmOpen: { state: true },
    _busy: { state: true },
    _error: { state: true },
    _justCompleted: { state: true },
  };

  hass?: HomeAssistant;
  previewTask?: CountdownTask;
  private _config: CardConfig = { ...DEFAULT_CONFIG };
  private _optimisticTask?: CountdownTask;
  private _confirmOpen = false;
  private _busy = false;
  private _error = "";
  private _justCompleted = false;
  private _holdTimer?: number;
  private _tapTimer?: number;
  private _completionResetTimer?: number;
  private _tapPending = false;
  private _held = false;
  private _cachedTaskId?: string;
  private _cachedEntityId?: string;
  private _operationEpoch = 0;

  static getConfigElement(): HTMLElement {
    return document.createElement("cyclic-countdown-editor");
  }

  static getStubConfig(): Omit<CardConfig, "type"> {
    return { ...DEFAULT_OPTIONS };
  }

  setConfig(config: Partial<CardConfig>): void {
    if (!config) throw new Error("Card configuration is required");
    const previousTaskId = this._config.task_id;
    const legacyWidth = (config as Partial<CardConfig> & { width?: "standard" | "wide" }).width;
    const cleanConfig = { ...config } as Partial<CardConfig> & {
      width?: "standard" | "wide";
    };
    delete cleanConfig.width;
    this._config = {
      ...DEFAULT_CONFIG,
      ...cleanConfig,
      vertical_size: config.vertical_size || legacyWidth || "standard",
      type: "custom:cyclic-countdown-card",
    };
    if (previousTaskId !== this._config.task_id) {
      this._operationEpoch += 1;
      this._cachedTaskId = undefined;
      this._cachedEntityId = undefined;
      this._optimisticTask = undefined;
      this._busy = false;
      this._error = "";
      this.closeConfirm();
      this._justCompleted = false;
      this.clearHoldTimer();
      this.clearTapTimer();
      this._tapPending = false;
      this.clearCompletionResetTimer();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._operationEpoch += 1;
    this.clearHoldTimer();
    this.clearTapTimer();
    this.clearCompletionResetTimer();
    this._tapPending = false;
    this._held = false;
    this._busy = false;
    this._optimisticTask = undefined;
    this.closeConfirm();
    this._justCompleted = false;
  }

  getCardSize(): number {
    return this._config.vertical_size === "compact" ? 1 : 2;
  }

  getGridOptions(): Record<string, number> {
    if (this._config.vertical_size === "compact") {
      return { rows: 1, columns: 6, min_rows: 1, min_columns: 3 };
    }
    if (this._config.vertical_size === "wide") {
      return { rows: 2, columns: 6, min_rows: 2, min_columns: 3 };
    }
    return { columns: 6, min_columns: 3 };
  }

  protected willUpdate(changed: PropertyValues): void {
    if (!changed.has("hass")) return;
    const previous = changed.get("hass") as HomeAssistant | undefined;
    if (!previous?.connection || previous.connection === this.hass?.connection) return;
    this._operationEpoch += 1;
    this._cachedTaskId = undefined;
    this._cachedEntityId = undefined;
    this._optimisticTask = undefined;
    this._busy = false;
    this._error = "";
    this._justCompleted = false;
    this.closeConfirm();
    this.clearHoldTimer();
    this.clearTapTimer();
    this.clearCompletionResetTimer();
    this._tapPending = false;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("_confirmOpen") && this._confirmOpen) {
      const dialog = this.renderRoot.querySelector<HTMLDialogElement>("dialog");
      if (dialog && !dialog.open) dialog.showModal();
    }
  }

  private get locale(): string {
    return this.hass?.locale?.language || this.hass?.language || navigator.language;
  }

  private get entity(): HassEntity | undefined {
    if (!this.hass || !this._config.task_id) return undefined;
    const taskId = this._config.task_id;
    if (this._cachedTaskId !== taskId) {
      this._cachedTaskId = taskId;
      this._cachedEntityId = undefined;
    }
    if (this._cachedEntityId) {
      const cached = this.hass.states[this._cachedEntityId];
      if (cached?.attributes.task_id === taskId) return cached;
      this._cachedEntityId = undefined;
    }
    for (const [entityId, state] of Object.entries(this.hass.states)) {
      if (entityId.startsWith("sensor.") && state.attributes.task_id === taskId) {
        this._cachedEntityId = entityId;
        return state;
      }
    }
    return undefined;
  }

  private get task(): CountdownTask | undefined {
    if (this.previewTask) return this.previewTask;
    if (this._optimisticTask) return this._optimisticTask;
    const attributes = this.entity?.attributes;
    if (!attributes?.task_id) return undefined;
    return attributes as unknown as CountdownTask;
  }

  private get progress(): number {
    const task = this.task;
    if (!task) return 0;
    const progress = this._config.reverse_progress
      ? 1 - task.elapsed_progress
      : task.elapsed_progress;
    return Math.round(Math.min(1, Math.max(0, progress)) * 100);
  }

  private secondary(task: CountdownTask): string {
    const due = this._config.secondary_info === "due_date";
    const label = due ? t(this.locale, "dueDate") : t(this.locale, "completed");
    return `${label}: ${formatDate(due ? task.due_date : task.last_completed_date, this.locale)}`;
  }

  private renderSecondary(task: CountdownTask) {
    const due = this._config.secondary_info === "due_date";
    const date = due ? task.due_date : task.last_completed_date;
    const label = due ? t(this.locale, "dueDate") : t(this.locale, "completed");
    const formattedDate = formatDate(date, this.locale);
    return html`<div class="secondary" aria-label=${`${label}: ${formattedDate}`}>
      <ha-icon
        icon=${due ? "mdi:calendar-clock-outline" : "mdi:history"}
        aria-hidden="true"
      ></ha-icon>
      <time datetime=${date}>${formattedDate}</time>
    </div>`;
  }

  private renderPhaseIndicator(task: CountdownTask) {
    if (task.phase === "normal") return nothing;
    const icon = task.phase === "warning"
      ? "mdi:alert-circle-outline"
      : task.phase === "due"
        ? "mdi:calendar-alert"
        : "mdi:alert-octagon-outline";
    return html`<span class="phase-indicator" aria-hidden="true"><ha-icon .icon=${icon}></ha-icon></span>`;
  }

  private buildAriaLabel(task: CountdownTask): string {
    return `${task.name}, ${phaseLabel(task.phase, this.locale)}, ${task.remaining_days} ${dayUnit(
      task.remaining_days,
      this.locale,
    )}. ${this._config.tap_action === "complete" ? t(this.locale, "complete") : ""}`;
  }

  private clearHoldTimer(): void {
    if (this._holdTimer !== undefined) window.clearTimeout(this._holdTimer);
    this._holdTimer = undefined;
  }

  private clearTapTimer(): void {
    if (this._tapTimer !== undefined) window.clearTimeout(this._tapTimer);
    this._tapTimer = undefined;
  }

  private clearCompletionResetTimer(): void {
    if (this._completionResetTimer !== undefined) {
      window.clearTimeout(this._completionResetTimer);
    }
    this._completionResetTimer = undefined;
  }

  private pointerDown(event: PointerEvent): void {
    if (event.isPrimary === false || event.button !== 0) return;
    this._held = false;
    this.clearHoldTimer();
    // Pause a pending single tap while the second pointer gesture is in
    // progress. A quick release becomes a double tap; a hold cancels it.
    if (this._tapPending) this.clearTapTimer();
    if (this._config.hold_action === "none" || this._busy || this.previewTask) return;
    const surface = event.currentTarget as HTMLElement;
    if (typeof surface.setPointerCapture === "function") {
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; gesture cancellation still works.
      }
    }
    this._holdTimer = window.setTimeout(() => {
      this._held = true;
      this._holdTimer = undefined;
      this.clearTapTimer();
      this._tapPending = false;
      this.performAction(this._config.hold_action);
    }, 550);
  }

  private pointerUp(): void {
    this.clearHoldTimer();
  }

  private pointerCancel(): void {
    this.clearHoldTimer();
    this.clearTapTimer();
    this._tapPending = false;
    this._held = false;
  }

  private activate(): void {
    if (this._held || this._busy || this.previewTask) {
      this._held = false;
      return;
    }
    if (this._tapPending) {
      this.clearTapTimer();
      this._tapPending = false;
      this.performAction(this._config.double_tap_action);
      return;
    }
    this._tapPending = true;
    this._tapTimer = window.setTimeout(() => {
      this._tapTimer = undefined;
      this._tapPending = false;
      this.performAction(this._config.tap_action);
    }, 250);
  }

  private performAction(action: CardAction): void {
    if (action === "none" || this._busy || this.previewTask) return;
    if (action === "more-info") {
      this.moreInfo();
      return;
    }
    if (this._config.confirm_complete) this._confirmOpen = true;
    else void this.complete();
  }

  private keyActivate(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.ctrlKey || event.metaKey || (event.altKey && event.shiftKey)) return;
    event.preventDefault();
    if (event.repeat) return;
    this.clearTapTimer();
    this._tapPending = false;
    const action = event.altKey
      ? this._config.double_tap_action
      : event.shiftKey
        ? this._config.hold_action
        : this._config.tap_action;
    this.performAction(action);
  }

  private moreInfo(): void {
    const entityId = this.entity?.entity_id;
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }

  private closeConfirm(): void {
    const dialog = this.shadowRoot?.querySelector<HTMLDialogElement>("dialog");
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    this._confirmOpen = false;
  }

  private async complete(): Promise<void> {
    const task = this.task;
    if (!task || !this.hass || !this._config.task_id || this._busy) return;
    const taskId = this._config.task_id;
    const operationEpoch = this._operationEpoch;
    const connection = this.hass.connection;
    this.closeConfirm();
    this._busy = true;
    this._error = "";
    const previous = this._optimisticTask;
    const today = todayIsoInTimeZone(this.hass.config?.time_zone);
    const due = addCalendarDays(today, task.interval_days) || task.due_date;
    this._optimisticTask = {
      ...task,
      last_completed_date: today,
      due_date: due,
      remaining_days: task.interval_days,
      elapsed_progress: 0,
      phase: "normal",
    };
    try {
      const completedTask = await connection.sendMessagePromise<CountdownTask>({
        type: "cyclic_countdown/tasks/complete",
        task_id: taskId,
      });
      if (
        !this.isConnected
        || operationEpoch !== this._operationEpoch
        || taskId !== this._config.task_id
        || connection !== this.hass?.connection
      ) {
        this._optimisticTask = undefined;
        return;
      }
      this._optimisticTask = completedTask;
      this._justCompleted = true;
      this.clearCompletionResetTimer();
      this._completionResetTimer = window.setTimeout(() => {
        this._completionResetTimer = undefined;
        this._justCompleted = false;
        this._optimisticTask = undefined;
      }, 1800);
    } catch {
      if (
        this.isConnected
        && operationEpoch === this._operationEpoch
        && taskId === this._config.task_id
        && connection === this.hass?.connection
      ) {
        this._optimisticTask = previous;
        this._error = t(this.locale, "backendError");
      } else {
        this._optimisticTask = undefined;
      }
    } finally {
      if (
        operationEpoch === this._operationEpoch
        && taskId === this._config.task_id
        && connection === this.hass?.connection
      ) {
        this._busy = false;
      }
    }
  }

  render() {
    const task = this.task;
    if (!task) {
      return html`<ha-card class="missing">
        <ha-icon icon="mdi:wrench-clock"></ha-icon>
        <div><strong>${t(this.locale, "notFound")}</strong><small>cyclic_countdown</small></div>
      </ha-card>`;
    }
    const style = `--progress:${this.progress}%;--accent:${this._config.accent_color || "var(--primary-color, #6d78e8)"}`;
    return html`
      <ha-card
        class="card ${this._config.style} ${this._config.vertical_size} ${task.phase} ${this._justCompleted ? "just-completed" : ""}"
        style=${style}
        role="button"
        tabindex="0"
        aria-label=${this.buildAriaLabel(task)}
        aria-describedby="keyboard-help"
        aria-keyshortcuts="Enter Shift+Enter Alt+Enter"
        aria-busy=${this._busy ? "true" : "false"}
        @pointerdown=${this.pointerDown}
        @pointerup=${this.pointerUp}
        @pointercancel=${this.pointerCancel}
        @click=${this.activate}
        @keydown=${this.keyActivate}
      >
        <span id="keyboard-help" class="sr-only">${t(this.locale, "keyboardHelp")}</span>
        <div class="fill-layer" aria-hidden="true"></div>
        <div class="state-layer" aria-hidden="true"></div>
        <div class="content">
          <div class="icon-tile"><ha-icon .icon=${task.icon}></ha-icon></div>
          <div class="details">
            <div class="title-row">
              <div class="title">${task.name}</div>
              ${this.renderPhaseIndicator(task)}
              <span class="phase-label">${phaseLabel(task.phase, this.locale)}</span>
            </div>
            ${this._config.show_secondary
              ? this.renderSecondary(task)
              : nothing}
            ${this._config.style === "bar"
              ? html`<div class="track"><div class="bar-progress"></div></div>`
              : nothing}
          </div>
          <div class="days">
            <strong>${task.remaining_days}</strong>
            <span>${dayUnit(task.remaining_days, this.locale)}</span>
          </div>
        </div>
        ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing}
      </ha-card>
      <dialog @cancel=${this.closeConfirm} @click=${(event: MouseEvent) => {
        if (event.target === event.currentTarget) this.closeConfirm();
      }}>
        <div class="dialog-body">
          <h2>${t(this.locale, "confirmTitle")}</h2>
          <p>${task.name} · ${this.secondary(task)}</p>
          <div class="dialog-actions">
            <button class="secondary-button" @click=${this.closeConfirm}>${t(this.locale, "cancel")}</button>
            <button class="primary-button" @click=${this.complete}>${t(this.locale, "complete")}</button>
          </div>
        </div>
      </dialog>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      font-family: var(--ha-font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      --danger: var(--cyclic-countdown-danger-color, var(--error-color, #e46f68));
      --warn: var(--cyclic-countdown-warning-color, var(--warning-color, #e5a83b));
    }
    ha-card { box-sizing: border-box; color: var(--primary-text-color); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .card {
      display: block; width: 100%; position: relative; min-height: 112px; overflow: hidden; cursor: pointer; isolation: isolate; touch-action: manipulation;
      border-radius: var(--cyclic-countdown-radius, var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px)));
      background: var(--cyclic-countdown-background, var(--ha-card-background, var(--card-background-color, #fff)));
      border: var(--cyclic-countdown-border, var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, rgba(127,127,127,.18)));
      box-shadow: var(--cyclic-countdown-shadow, var(--ha-card-box-shadow, 0 3px 14px rgba(0,0,0,.08)));
      -webkit-backdrop-filter: var(--cyclic-countdown-backdrop-filter, var(--ha-card-backdrop-filter, none));
      backdrop-filter: var(--cyclic-countdown-backdrop-filter, var(--ha-card-backdrop-filter, none));
      transition: transform 180ms ease, box-shadow 180ms ease;
    }
    .card.standard { min-height: auto; }
    .standard .content { min-height: 88px; padding: 9px 14px; grid-template-columns: 58px minmax(0,1fr) 70px; gap: 12px; }
    .standard .icon-tile { width: 58px; height: 58px; border-radius: 18px; }
    .standard .icon-tile ha-icon { --mdc-icon-size: 30px; }
    .standard .title { font-size: 19px; }
    .standard .secondary { margin-top: 3px; font-size: 13px; }
    .standard .days strong { font-size: 40px; }
    .standard .track { margin-top: 9px; }
    .card.compact { min-height: auto; }
    .compact .content { min-height: 54px; padding: 6px 10px; grid-template-columns: 40px minmax(0,1fr) 48px; gap: 10px; }
    .compact .icon-tile { width: 40px; height: 40px; border-radius: 13px; }
    .compact .icon-tile ha-icon { --mdc-icon-size: 23px; }
    .compact .title { font-size: 16px; }
    .compact .secondary, .compact .phase-label { display: none; }
    .compact .days strong { font-size: 30px; }
    .compact .days span { margin-top: 1px; font-size: 9px; }
    .compact .track { height: 4px; margin-top: 5px; }
    .card:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 70%, white); outline-offset: 3px; }
    .card:active { transform: scale(.995); }
    .content { position: relative; z-index: 2; min-height: 112px; padding: 12px 16px; display: grid; grid-template-columns: 70px minmax(0,1fr) 82px; gap: 16px; align-items: center; box-sizing: border-box; }
    .icon-tile { position: relative; z-index: 3; width: 70px; height: 70px; display: grid; place-items: center; border-radius: 22px; background: var(--cyclic-countdown-icon-background, color-mix(in srgb, var(--accent) 13%, var(--secondary-background-color, var(--primary-background-color, #20242c)))); border: var(--cyclic-countdown-icon-border, 1px solid color-mix(in srgb, var(--accent) 10%, var(--divider-color, transparent))); box-shadow: var(--cyclic-countdown-icon-shadow, 0 5px 14px color-mix(in srgb, black 7%, transparent), inset 0 1px 0 color-mix(in srgb, white 8%, transparent)); -webkit-backdrop-filter: var(--cyclic-countdown-icon-backdrop-filter, none); backdrop-filter: var(--cyclic-countdown-icon-backdrop-filter, none); color: var(--accent); }
    .icon-tile ha-icon { position: relative; z-index: 1; --mdc-icon-size: 34px; }
    .details { min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
    .title-row { display: flex; align-items: baseline; gap: 9px; min-width: 0; }
    .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 21px; line-height: 1.22; font-weight: 650; letter-spacing: -.018em; }
    .phase-label { flex: none; font-size: 12px; font-weight: 550; letter-spacing: 0; color: var(--secondary-text-color); }
    .phase-indicator { display: none; flex: none; place-items: center; }
    .phase-indicator ha-icon { --mdc-icon-size: 15px; }
    .warning .phase-indicator { color: var(--warn); }
    .due .phase-indicator, .overdue .phase-indicator { color: var(--danger); }
    .compact.warning .phase-indicator, .compact.due .phase-indicator, .compact.overdue .phase-indicator { display: grid; }
    .normal .phase-label { display: none; }
    .secondary { min-width: 0; margin-top: 5px; display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; color: var(--secondary-text-color); font-size: 14px; line-height: 1.3; }
    .secondary ha-icon { flex: none; --mdc-icon-size: 15px; }
    .secondary time { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .days { min-width: 0; text-align: center; display: flex; flex-direction: column; align-items: center; line-height: 1; }
    .days strong { font-size: clamp(40px, 8vw, 52px); font-weight: 700; letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
    .days span { max-width: 100%; margin-top: 3px; overflow: hidden; letter-spacing: .015em; font-size: 11px; font-weight: 500; color: var(--secondary-text-color); }
    .track { height: 6px; margin-top: 13px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--divider-color, #888) 28%, transparent); }
    .bar-progress { width: var(--progress); height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 78%, #9c6fe8), color-mix(in srgb, var(--accent) 68%, #f2c45d)); transition: width .45s cubic-bezier(.2,.8,.2,1); }
    .fill-layer, .state-layer { position: absolute; inset: 0; pointer-events: none; }
    .fill-layer { z-index: 0; width: var(--progress); right: auto; background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 7%, transparent)); transition: width .45s cubic-bezier(.2,.8,.2,1); }
    .fill-layer::after { content: ""; position: absolute; inset: 0 0 0 auto; width: 1px; background: color-mix(in srgb, var(--accent) 18%, transparent); opacity: clamp(0, var(--progress), 1); }
    .bar .fill-layer { display: none; }
    .state-layer { z-index: 1; opacity: 0; }
    .warning .state-layer { background: radial-gradient(circle at 90% 50%, color-mix(in srgb, var(--warn) 24%, transparent), transparent 67%); animation: warning-breathe 3.2s ease-in-out infinite; }
    .due .state-layer, .overdue .state-layer { background: radial-gradient(circle at 88% 50%, color-mix(in srgb, var(--danger) 27%, transparent), transparent 68%); animation: danger-breathe 2.9s ease-in-out infinite; }
    .warning .phase-label { color: var(--warn); }
    .due .phase-label, .overdue .phase-label, .overdue .days strong { color: var(--danger); }
    .just-completed .state-layer { background: color-mix(in srgb, var(--success-color, #43a66d) 18%, transparent); animation: success-flash 1.7s ease-out; }
    .error { position: relative; z-index: 4; padding: 7px 14px; background: color-mix(in srgb, var(--danger) 16%, var(--card-background-color)); color: var(--primary-text-color); font-size: 12px; }
    .missing { min-height: 96px; padding: 18px; display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center; border-radius: var(--ha-card-border-radius, 20px); }
    .missing div { display: flex; flex-direction: column; gap: 4px; }
    .missing small { color: var(--secondary-text-color); }
    button { min-height: 44px; border: 0; border-radius: 13px; padding: 0 16px; font: inherit; font-weight: 650; cursor: pointer; color: var(--primary-text-color); background: var(--secondary-background-color, rgba(127,127,127,.12)); }
    dialog { width: min(420px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--divider-color); border-radius: 22px; color: var(--primary-text-color); background: var(--card-background-color, #fff); box-shadow: 0 20px 60px rgba(0,0,0,.28); }
    dialog::backdrop { background: rgba(0,0,0,.42); backdrop-filter: blur(3px); }
    .dialog-body { padding: 24px; }
    h2 { margin: 0 0 9px; font-size: 21px; }
    p { margin: 0; color: var(--secondary-text-color); }
    .dialog-actions { margin-top: 24px; display: flex; justify-content: flex-end; gap: 10px; }
    .primary-button { background: var(--primary-color); color: var(--text-primary-color, white); }
    @keyframes warning-breathe { 0%,100% { opacity: .38; transform: scale(1); } 50% { opacity: .9; transform: scale(1.006); } }
    @keyframes danger-breathe { 0%,100% { opacity: .42; transform: scale(1); } 50% { opacity: .95; transform: scale(1.009); } }
    @keyframes success-flash { 0% { opacity: .9; } 100% { opacity: 0; } }
    @media (max-width: 420px) {
      .content { padding: 13px 14px; grid-template-columns: 58px minmax(0,1fr) 66px; gap: 11px; }
      .icon-tile { width: 58px; height: 58px; border-radius: 18px; }
      .icon-tile ha-icon { --mdc-icon-size: 30px; }
      .title { font-size: 18px; }
      .secondary { font-size: 12px; }
      .phase-label { display: none; }
      .warning .phase-indicator, .due .phase-indicator, .overdue .phase-indicator { display: grid; }
      .days strong { font-size: 38px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition-duration: .01ms !important; }
      .warning .state-layer { opacity: .62; }
      .due .state-layer, .overdue .state-layer { opacity: .68; }
    }
  `;
}

if (!customElements.get("cyclic-countdown-card")) {
  customElements.define("cyclic-countdown-card", CyclicCountdownCard);
}

const CARD_PICKER_ENTRY = {
  type: "cyclic-countdown-card",
  name: "Maintenance Countdown",
  description: "A theme-aware calendar-day maintenance countdown",
  preview: false,
  documentationURL: "https://github.com/PnnnG/Maintenance-Countdown",
};

export const registerCardPickerEntry = (): void => {
  window.customCards = window.customCards || [];
  const existing = window.customCards.find(
    (card) => card.type === CARD_PICKER_ENTRY.type,
  );
  if (existing) {
    Object.assign(existing, CARD_PICKER_ENTRY);
    return;
  }
  window.customCards.push({ ...CARD_PICKER_ENTRY });
};

registerCardPickerEntry();
