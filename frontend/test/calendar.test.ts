import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  calendarDayDifference,
  todayIsoInTimeZone,
} from "../src/utils/calendar";

describe("calendar date helpers", () => {
  it("uses the Home Assistant timezone rather than the browser timezone", () => {
    const instant = new Date("2026-08-11T01:30:00Z");
    expect(todayIsoInTimeZone("Pacific/Honolulu", instant)).toBe("2026-08-10");
    expect(todayIsoInTimeZone("Pacific/Kiritimati", instant)).toBe("2026-08-11");
  });

  it("adds and compares calendar days without DST-length assumptions", () => {
    expect(addCalendarDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(calendarDayDifference("2026-03-30", "2026-03-28")).toBe(2);
  });

  it("rejects invalid calendar dates", () => {
    expect(addCalendarDays("2026-02-31", 1)).toBeUndefined();
    expect(calendarDayDifference("not-a-date", "2026-03-28")).toBeUndefined();
  });
});
