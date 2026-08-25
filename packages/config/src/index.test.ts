import { describe, it, expect } from "vitest";
import { loadEnv, EnvValidationError, providerKeyStatus } from "./index";

const validBase: Record<string, string> = {
  DATABASE_URL: "postgresql://oie:oie@localhost:5432/oie?schema=public",
  AUTH_SECRET: "test-secret".repeat(4),
};

describe("loadEnv", () => {
  it("accepts a valid minimal environment and applies safe defaults", () => {
    const env = loadEnv(validBase);
    expect(env.DRY_RUN).toBe(true); // safe default
    expect(env.DAILY_LLM_COST_CAP_USD).toBe(25);
    expect(env.DAILY_PROVIDER_COST_CAP_USD).toBe(50);
    expect(env.MIN_FREE_DISK_GB).toBe(5);
    expect(env.NODE_ENV).toBe("development");
  });

  it("fails fast and aggregates problems for an invalid environment", () => {
    expect(() => loadEnv({ DATABASE_URL: "not-a-url", AUTH_SECRET: "short" })).toThrow(
      EnvValidationError,
    );
    try {
      loadEnv({ DATABASE_URL: "not-a-url", AUTH_SECRET: "short" });
    } catch (e) {
      const err = e as EnvValidationError;
      expect(err.problems.length).toBe(2);
      expect(err.problems.join("\n")).toContain("DATABASE_URL");
      expect(err.problems.join("\n")).toContain("AUTH_SECRET");
    }
  });

  it("coerces DRY_RUN string representations", () => {
    expect(loadEnv({ ...validBase, DRY_RUN: "false" }).DRY_RUN).toBe(false);
    expect(loadEnv({ ...validBase, DRY_RUN: "1" }).DRY_RUN).toBe(true);
    expect(loadEnv({ ...validBase, DRY_RUN: "off" }).DRY_RUN).toBe(false);
  });

  it("rejects a non-numeric cost cap", () => {
    expect(() => loadEnv({ ...validBase, DAILY_LLM_COST_CAP_USD: "lots" })).toThrow(
      EnvValidationError,
    );
  });
});

describe("providerKeyStatus", () => {
  it("reports all provider keys missing for a keyless build", () => {
    const { present, missing } = providerKeyStatus(loadEnv(validBase));
    expect(present).toHaveLength(0);
    expect(missing).toContain("ANTHROPIC_API_KEY");
    expect(missing.length).toBeGreaterThan(10);
  });

  it("counts a present key", () => {
    const env = loadEnv({ ...validBase, ANTHROPIC_API_KEY: "sk-ant-xxx" });
    const { present, missing } = providerKeyStatus(env);
    expect(present).toContain("ANTHROPIC_API_KEY");
    expect(missing).not.toContain("ANTHROPIC_API_KEY");
  });
});
