# Autonomous build window

- STARTED_AT_EPOCH: 1782314267
- STARTED_AT: 2026-06-24 19:17:47 +04
- STOP_AFTER_EPOCH: 1782343067
- STOP_AFTER: 2026-06-25 03:17:47 +04  (8 hours)

The loop must STOP (CronDelete its own job) once `date +%s` >= STOP_AFTER_EPOCH (1782343067),
or when every BACKLOG item is checked. Started by the operator before leaving; full autonomy authorized.
