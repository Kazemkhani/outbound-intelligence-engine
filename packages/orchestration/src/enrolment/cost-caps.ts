/**
 * Daily cost-cap enforcement (brief §7, §13.10, addendum §6). The caps govern
 * the OIE application's provider spend and must HALT non-critical work when
 * exceeded — enforced here in the orchestration code, not as a tooling setting.
 */

export interface CostCaps {
  dailyLlmUsd: number;
  dailyProviderUsd: number;
}

export interface DailySpend {
  llmUsd: number;
  providerUsd: number;
}

export interface CostCapStatus {
  llmExceeded: boolean;
  providerExceeded: boolean;
  /** True when any cap is hit — the orchestrator must halt non-critical work. */
  halt: boolean;
  reason: string;
}

/** Evaluate spend against caps. Pure; the caller supplies the day's spend. */
export function costCapStatus(spend: DailySpend, caps: CostCaps): CostCapStatus {
  const llmExceeded = spend.llmUsd >= caps.dailyLlmUsd;
  const providerExceeded = spend.providerUsd >= caps.dailyProviderUsd;
  const halt = llmExceeded || providerExceeded;
  const reasons: string[] = [];
  if (llmExceeded) reasons.push(`LLM spend $${spend.llmUsd} >= cap $${caps.dailyLlmUsd}`);
  if (providerExceeded)
    reasons.push(`provider spend $${spend.providerUsd} >= cap $${caps.dailyProviderUsd}`);
  return {
    llmExceeded,
    providerExceeded,
    halt,
    reason: halt ? reasons.join("; ") : "within caps",
  };
}

/** Guard for use before a costed operation; throws when a cap is exceeded. */
export class CostCapExceededError extends Error {
  constructor(public readonly status: CostCapStatus) {
    super(`cost cap exceeded: ${status.reason}`);
    this.name = "CostCapExceededError";
  }
}

export function assertWithinCaps(spend: DailySpend, caps: CostCaps): void {
  const status = costCapStatus(spend, caps);
  if (status.halt) throw new CostCapExceededError(status);
}
