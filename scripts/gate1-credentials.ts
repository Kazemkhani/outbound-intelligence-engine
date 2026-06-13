/**
 * Human Gate 1 — credentials checkpoint (brief §3.4, §12).
 * Reports which provider keys are present vs missing. Never prints values.
 * Does NOT block on missing keys: adapters are built and fixture-tested regardless.
 */
import { loadEnv, providerKeyStatus } from "../packages/config/src/index";

const env = loadEnv();
const { present, missing } = providerKeyStatus(env);

console.log(`DRY_RUN=${env.DRY_RUN}  (must be true until the live-send gate)`);
console.log(
  `Cost caps: LLM $${env.DAILY_LLM_COST_CAP_USD}/day, providers $${env.DAILY_PROVIDER_COST_CAP_USD}/day`,
);
console.log(`\nProvider keys present (${present.length}): ${present.join(", ") || "(none)"}`);
console.log(`Provider keys missing (${missing.length}):`);
for (const k of missing) console.log(`  - ${k}`);
