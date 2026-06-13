import { envSchema, PROVIDER_KEYS, type Env, type ProviderKey } from "./schema";

export { envSchema, PROVIDER_KEYS };
export type { Env, ProviderKey };

/** Thrown when the environment fails validation. Lists every problem at once. */
export class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n  - ${problems.join("\n  - ")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Validate an environment source (defaults to process.env). Fails fast with a
 * readable, aggregated error. Pure and side-effect free so it is unit-testable.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new EnvValidationError(problems);
  }
  return result.data;
}

let cached: Env | undefined;

/** Memoised accessor for the process environment. Throws on first use if invalid. */
export function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Reset the memoised env — for tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * Report which provider keys are present vs missing — the data behind the
 * Human Gate 1 credentials checkpoint (§3.4). Never throws; never logs values.
 */
export function providerKeyStatus(env: Env): {
  present: ProviderKey[];
  missing: ProviderKey[];
} {
  const present: ProviderKey[] = [];
  const missing: ProviderKey[] = [];
  for (const key of PROVIDER_KEYS) {
    if (env[key] && String(env[key]).trim().length > 0) present.push(key);
    else missing.push(key);
  }
  return { present, missing };
}
