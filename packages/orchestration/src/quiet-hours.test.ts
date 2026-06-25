import { describe, it, expect } from "vitest";
import { isWithinCallingWindow, UAE_CALLING_WINDOW, type CallingWindow } from "./quiet-hours";

// Asia/Dubai is UTC+4, no DST. The instants below were confirmed against Intl.
describe("isWithinCallingWindow (UAE default: 09-18, Mon-Fri)", () => {
  it("is open on a weekday inside the window", () => {
    expect(isWithinCallingWindow(new Date("2026-06-25T10:00:00Z"))).toBe(true); // Thu 14:00 Dubai
    expect(isWithinCallingWindow(new Date("2026-06-29T08:00:00Z"))).toBe(true); // Mon 12:00 Dubai
  });

  it("is closed before the start hour", () => {
    expect(isWithinCallingWindow(new Date("2026-06-25T03:00:00Z"))).toBe(false); // Thu 07:00 Dubai
  });

  it("is closed at/after the end hour", () => {
    expect(isWithinCallingWindow(new Date("2026-06-25T16:00:00Z"))).toBe(false); // Thu 20:00 Dubai
  });

  it("is closed on the weekend (Saturday and Sunday)", () => {
    expect(isWithinCallingWindow(new Date("2026-06-27T08:00:00Z"))).toBe(false); // Sat 12:00 Dubai
    expect(isWithinCallingWindow(new Date("2026-06-28T08:00:00Z"))).toBe(false); // Sun 12:00 Dubai
  });

  it("respects a custom window", () => {
    const win: CallingWindow = { tz: "Asia/Dubai", startHour: 20, endHour: 22, allowedWeekdays: [4] };
    expect(isWithinCallingWindow(new Date("2026-06-25T16:00:00Z"), win)).toBe(true); // Thu 20:00
    expect(isWithinCallingWindow(new Date("2026-06-25T10:00:00Z"), win)).toBe(false); // Thu 14:00
  });

  it("exposes a conservative UAE default", () => {
    expect(UAE_CALLING_WINDOW.tz).toBe("Asia/Dubai");
    expect(UAE_CALLING_WINDOW.allowedWeekdays).not.toContain(6); // no Saturday
    expect(UAE_CALLING_WINDOW.allowedWeekdays).not.toContain(0); // no Sunday
  });
});
