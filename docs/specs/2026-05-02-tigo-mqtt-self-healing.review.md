# Review: Tigo MQTT Self-Healing System

## Review Status
- **Spec:** docs/specs/2026-05-02-tigo-mqtt-self-healing.md
- **Started:** 2026-05-02
- **Last Updated:** 2026-05-02 (post-pass-1 fixes)
- **Iteration:** 2 of 5 (pending)
- **Status:** IN_PROGRESS

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 2        |
| HIGH     | 0    | 9        |
| MEDIUM   | 4    | 10       |
| LOW      | 4    | 6        |

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 35    | 27       | 0   | Initial full pass |

## Open Issues (carried into Iteration 2)

### MEDIUM (deferred — low impact relative to architectural fixes)

**M-2: 400 vs 404 vs 422 for unknown bounce path** — RESOLVED in fix to FR-3.10 (404 chosen).

**M-9: watchdog needs its own /data volume mount** — RESOLVED in FR-3.13 expansion.

**M-11: heartbeat QoS 1 wasteful** — RESOLVED in FR-3.16 (downgraded to QoS 0).

**M-Open-1 (was M-2)**: VERIFIED resolved.

**M-Open-2: PR1 task list not yet updated to reflect FR-1.1 wording change.** Tasks at line 599+ reference `rm -rf /run/taptap` (full directory) but the new FR-1.1 specifies `rm -rf /run/taptap/*` (contents only). Task descriptions need to align.

**M-Open-3: PR2 task list missing new requirements.** Tasks don't mention:
- `BOUNCE_TOKEN` env var (FR-3.10 auth)
- `PRIMARY_CONTAINER` / `SECONDARY_CONTAINER` env vars (FR-3.5)
- `MQTT_RECONNECT_GRACE_CUTOFF_SEC` (FR-3.12)
- `bounce_failed` event handling (FR-3.9b)
- Slugification of TOPIC_NAME (FR-2.5)
- Webhook auth tests
- The `./watchdog-data:/data` volume mount

**M-Open-4: PR3 task list missing new requirements.** Tasks don't mention:
- Pi address + bounce token added to `secrets.yaml`
- Sensor value_template configuration
- Adjustment for the deploy-time substitution mechanism (push_dashboard.py)

### LOW

**L-1: heartbeat uptime_seconds precision** — RESOLVED in FR-3.16.
**L-3: SQLite prune-on-startup only** — RESOLVED in FR-3.13 (added periodic prune).
**L-4: threshold table manual-webhook row** — no fix needed.
**L-5: Date field vs "May 2026"** — cosmetic, deferred.
**L-6: breaker trip not separately logged in SQLite** — accepted as out-of-scope.
**L-7: HA rest_command timeout=10s rationale** — RESOLVED in FR-4.7.

**L-Open-1: Edge Cases section still references "(not specified above as a separate FR — added here as an implementation requirement)"** — should be updated to reference the new FR-3.9b instead of saying "not specified above".

## Resolved Issues

### Iteration 1

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| C-1 | CRITICAL | docker-socket-proxy + network_mode: host conflict | NFR-1.2 specifies host networking + 127.0.0.1 bind; alternative bridge documented |
| C-2 | CRITICAL | last-seen reset masks outages | FR-3.12 split into ≤60s preserve / >60s reset; new event |
| H-1 | HIGH | SQLite/MQTT/docker-call ordering | FR-3.13 specifies explicit order + helper signatures |
| H-2 | HIGH | Circuit breaker reset semantics | FR-3.7 specifies SQL-driven implicit trip/untrip |
| H-3 | HIGH | Heartbeat retain=true vs HA value_template | FR-4.1 specifies value_template for `ts` |
| H-4 | HIGH | state-topic payload undefined | FR-4.1 specifies `value_template: now().isoformat()` |
| H-5 | HIGH | hardcoded Pi LAN IP | FR-4.7 uses HA secrets.yaml + deploy-time substitution |
| H-6 | HIGH | sed patch idempotency | FR-2.3 fails loudly via diff -q |
| H-7 | HIGH | webhook unauthenticated | FR-3.10 adds X-Bounce-Token header |
| H-8 | HIGH | FR-1.2 indeterminate cause | added 3-outcome handling |
| H-9 | HIGH | broker-outage false-positive watchdog-dead | FR-3.16 documents as Known Limitation |
| M-1 | MED | cooldown clock start | FR-3.6 specifies 2xx response start |
| M-2 | MED | 400 vs 404 | FR-3.10 chose 404 |
| M-3 | MED | SQLite concurrency | FR-3.13 specifies asyncio.Lock or aiosqlite |
| M-4 | MED | silence loop slop | threshold table updated |
| M-5 | MED | /healthz status precedence | FR-3.11 specifies down > degraded |
| M-6 | MED | for: 30s rationale | FR-4.3 documents debounce purpose |
| M-7 | MED | bounce confirmation text | FR-4.6 buttons updated |
| M-8 | MED | bounce_failed not promoted to FR | new FR-3.9b |
| M-9 | MED | watchdog /data volume | FR-3.13 specifies ./watchdog-data:/data |
| M-10 | MED | TOPIC_NAME slugification | FR-2.5 expanded with examples |
| M-11 | MED | heartbeat QoS 1 wasteful | FR-3.16 downgraded to QoS 0 |
| M-12 | MED | paho 1.6.1 verification | FR-2.6 cites source |
| M-13 | MED | rm -rf risks | FR-1.1 uses contents-only glob |
| M-14 | MED | container names hardcoded | FR-3.5 uses env vars |
| L-1 | LOW | uptime_seconds precision | FR-3.16 specifies int |
| L-2 | LOW | hardcoded LAN IPs in diagram | note added |
| L-3 | LOW | prune on startup only | FR-3.13 adds periodic prune |
| L-7 | LOW | rest_command timeout | FR-4.7 explains |
| L-8 | LOW | "if one exists" | FR-5.3 simplified |
| L-9 | LOW | "Auto-recovery is offline" wording | FR-4.5b body updated |
| L-10 | LOW | confirmation text consistency | merged with M-7 |
