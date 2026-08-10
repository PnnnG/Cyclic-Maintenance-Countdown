export type CardStyle = "bar" | "fill";
export type CardVerticalSize = "standard" | "wide";
export type CardAction = "complete" | "more-info" | "none";
export type TaskPhase = "normal" | "warning" | "due" | "overdue";
export type PreviewPhase = "auto" | TaskPhase;

export interface HomeAssistant {
  language?: string;
  locale?: { language?: string };
  states: Record<string, HassEntity>;
  connection: {
    sendMessagePromise<T>(message: Record<string, unknown>): Promise<T>;
  };
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface CountdownTask {
  task_id: string;
  name: string;
  icon: string;
  interval_days: number;
  last_completed_date: string;
  due_date: string;
  warning_days: number;
  notifications_enabled: boolean;
  persistent_notification_enabled: boolean;
  notification_targets: string[];
  notification_title: string;
  notification_message: string;
  notify_on_warning: boolean;
  notify_on_due: boolean;
  cycle_id?: string;
  remaining_days: number;
  elapsed_progress: number;
  phase: TaskPhase;
}

export interface CardConfig {
  type: "custom:cyclic-countdown-card";
  task_id?: string;
  style: CardStyle;
  vertical_size: CardVerticalSize;
  reverse_progress: boolean;
  confirm_complete: boolean;
  show_secondary: boolean;
  secondary_info: "due_date" | "last_completed";
  tap_action: CardAction;
  hold_action: CardAction;
  double_tap_action: CardAction;
  accent_color?: string;
}

export interface NotificationTarget {
  id: string;
  name: string;
  available: boolean;
  kind: "entity" | "legacy_service";
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
