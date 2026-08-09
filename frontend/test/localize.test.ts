import { describe, expect, it } from "vitest";

import { dayUnit, formatDate, phaseLabel } from "../src/localize/localize";

describe("localization", () => {
  it.each([
    [1, "день"],
    [2, "дня"],
    [5, "дней"],
    [11, "дней"],
    [21, "день"],
    [-2, "дня"],
  ])("pluralizes %s in Russian", (days, unit) => {
    expect(dayUnit(days, "ru-RU")).toBe(unit);
  });

  it("pluralizes English days", () => {
    expect(dayUnit(1, "en-US")).toBe("day");
    expect(dayUnit(0, "en-US")).toBe("days");
  });

  it("falls back to English for an unsupported locale", () => {
    expect(dayUnit(2, "de-DE")).toBe("days");
    expect(phaseLabel("due", "de-DE")).toBe("due today");
  });

  it("localizes phase labels and dates", () => {
    expect(phaseLabel("overdue", "ru")).toBe("просрочено");
    expect(formatDate("2026-08-23", "en-US")).toContain("Aug");
  });
});
