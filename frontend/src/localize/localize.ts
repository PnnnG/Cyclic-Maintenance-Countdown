import type { TaskPhase } from "../models/types";

const translations = {
  en: {
    dayOne: "day",
    dayFew: "days",
    dayMany: "days",
    remaining: "remaining",
    overdue: "overdue",
    due: "due today",
    warning: "due soon",
    lastCompleted: "Last completed",
    completed: "Completed",
    dueDate: "Due",
    notFound: "Task not found",
    configure: "Configure",
    complete: "Complete",
    cancel: "Cancel",
    confirmTitle: "Complete now?",
    backendError: "Could not save completion. Please try again.",
  },
  ru: {
    dayOne: "день",
    dayFew: "дня",
    dayMany: "дней",
    remaining: "осталось",
    overdue: "просрочено",
    due: "сегодня",
    warning: "скоро",
    lastCompleted: "Последнее выполнение",
    completed: "Выполнено",
    dueDate: "Срок",
    notFound: "Задача не найдена",
    configure: "Настроить",
    complete: "Выполнено",
    cancel: "Отмена",
    confirmTitle: "Выполнено сейчас?",
    backendError: "Не удалось сохранить выполнение. Попробуйте ещё раз.",
  },
} as const;

export function language(locale?: string): "ru" | "en" {
  return locale?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function t(locale: string | undefined, key: keyof typeof translations.en): string {
  return translations[language(locale)][key];
}

export function dayUnit(value: number, locale?: string): string {
  if (language(locale) === "en") return Math.abs(value) === 1 ? "day" : "days";
  const absolute = Math.abs(value);
  const mod10 = absolute % 10;
  const mod100 = absolute % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

export function phaseLabel(phase: TaskPhase, locale?: string): string {
  if (phase === "overdue") return t(locale, "overdue");
  if (phase === "due") return t(locale, "due");
  if (phase === "warning") return t(locale, "warning");
  return t(locale, "remaining");
}

export function formatDate(value: string, locale?: string, withTime = false): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || "en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
