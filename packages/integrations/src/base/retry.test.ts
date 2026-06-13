import { describe, it, expect, vi } from "vitest";
import { withRetry, withTimeout, backoffDelay } from "./retry";
import { AdapterError } from "./errors";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns on first success without retrying", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(op, { sleep: noSleep })).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors up to the limit then throws the last", async () => {
    const err = new AdapterError({ kind: "rate_limit", provider: "x", message: "429" });
    const op = vi.fn().mockRejectedValue(err);
    await expect(withRetry(op, { retries: 2, sleep: noSleep, random: () => 0 })).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry non-retryable errors", async () => {
    const err = new AdapterError({ kind: "auth", provider: "x", message: "401" });
    const op = vi.fn().mockRejectedValue(err);
    await expect(withRetry(op, { retries: 5, sleep: noSleep })).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("recovers when a later attempt succeeds", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new AdapterError({ kind: "timeout", provider: "x", message: "t" }))
      .mockResolvedValue("recovered");
    await expect(withRetry(op, { sleep: noSleep, random: () => 0 })).resolves.toBe("recovered");
    expect(op).toHaveBeenCalledTimes(2);
  });
});

describe("withTimeout", () => {
  it("rejects with a timeout AdapterError when too slow", async () => {
    const slow = new Promise((r) => setTimeout(r, 50));
    await expect(withTimeout(slow, 5)).rejects.toMatchObject({ kind: "timeout" });
  });
  it("resolves when fast enough", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});

describe("backoffDelay", () => {
  it("never exceeds the max and grows with attempts", () => {
    expect(backoffDelay(0, 100, 5000, () => 1)).toBeLessThanOrEqual(100);
    expect(backoffDelay(10, 100, 5000, () => 1)).toBeLessThanOrEqual(5000);
    expect(backoffDelay(0, 100, 5000, () => 0)).toBe(0);
  });
});
