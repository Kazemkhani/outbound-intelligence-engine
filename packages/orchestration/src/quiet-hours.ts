/**
 * Calling-window / quiet-hours policy (NX4). UAE TDRA telemarketing rules restrict
 * outbound voice and messaging to a daytime window on working days, with no
 * weekends or public holidays. This module is the pure, testable predicate. It
 * is one input to a compliant channel gate; public-holiday and consent screening
 * remain deployment responsibilities. `now` is injected so the check is
 * deterministic and the engine never reads the clock inside a pure function.
 */

export interface CallingWindow {
  /** IANA timezone the window is expressed in. */
  tz: string;
  /** Inclusive local start hour (0..23). */
  startHour: number;
  /** Exclusive local end hour (0..23). */
  endHour: number;
  /** Local weekdays the window is open. 0 = Sunday ... 6 = Saturday. */
  allowedWeekdays: number[];
}

/**
 * Conservative UAE default: 09:00 to 18:00 Asia/Dubai, Monday to Friday only
 * (the UAE weekend is Saturday and Sunday). Public holidays are NOT encoded here
 * and must be screened separately before any live dial.
 */
export const UAE_CALLING_WINDOW: CallingWindow = {
  tz: "Asia/Dubai",
  startHour: 9,
  endHour: 18,
  allowedWeekdays: [1, 2, 3, 4, 5],
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The local hour (0..23) and weekday (0..6) of `now` in the given timezone. */
function localHourAndWeekday(now: Date, tz: string): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const wdStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  // hour12:false can render midnight as "24" in some runtimes; normalise to 0.
  const hour = Number(hourStr) % 24;
  return { hour, weekday: WEEKDAY_INDEX[wdStr] ?? 0 };
}

/**
 * True when `now` falls inside the calling window (allowed weekday and
 * startHour <= local hour < endHour). Holidays are out of scope here.
 */
export function isWithinCallingWindow(
  now: Date,
  window: CallingWindow = UAE_CALLING_WINDOW,
): boolean {
  const { hour, weekday } = localHourAndWeekday(now, window.tz);
  if (!window.allowedWeekdays.includes(weekday)) return false;
  return hour >= window.startHour && hour < window.endHour;
}
