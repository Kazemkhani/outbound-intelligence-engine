# Security policy

OIE handles API credentials, contact data, and channel adapters. Security and consent boundaries are part of the product contract.

## Report a vulnerability

Use GitHub's **Report a vulnerability** button in the Security tab to send a private report. Do not open a public issue or include credentials, prospect data, or exploit details in a discussion.

Include the affected component, reproduction steps, expected impact, and any suggested mitigation. The maintainer will acknowledge valid reports as quickly as practical and coordinate disclosure after a fix is available.

## Supported versions

Security fixes target the latest commit on `main`. Tagged releases follow semantic versioning once the first stable release is published.

## Security boundaries

- Secrets are loaded from environment variables, validated by `@oie/config`, and never committed or logged.
- Provider payloads and LLM-shaped input are validated at their boundaries.
- A real outbound action requires dry-run to be deliberately disabled and the exact action to have explicit human approval.
- LinkedIn and WhatsApp require an additional channel-enable condition and are off by default.
- Suppression checks run before the send gate; audit records capture material actions.
- CI runs tests, type checks, builds, and a full-history secret scan.
- Example and test data must be synthetic. Never commit real prospect PII.

The safety logic is documented in [ADR-0009](docs/adr/0009-send-gate-and-dry-run.md) and implemented in [`packages/orchestration/src/send-gate.ts`](packages/orchestration/src/send-gate.ts).

## Dependency handling

Dependabot monitors npm and GitHub Actions dependencies. Security updates must pass the full `pnpm verify` gate before merge. If a transitive package has no maintained fix, document the exposure and remove or replace the dependency rather than suppressing the advisory indefinitely.
