# Review: Tigo MQTT Self-Healing System

## Review Status
- **Spec:** docs/specs/2026-05-02-tigo-mqtt-self-healing.md
- **Started:** 2026-05-02
- **Last Updated:** 2026-05-02 (post-pass-2 fixes)
- **Iteration:** 2 of 5 — COMPLETE
- **Status:** READY (3 LOW findings accepted as-is)

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 2        |
| HIGH     | 0    | 9        |
| MEDIUM   | 0    | 14       |
| LOW      | 3    | 7        |

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 35    | 27       | 0   | Initial full pass |
| 2    | 6     | 5        | 0   | PR task lists, Edge Cases ref, regression sweep |

## Open Issues (accepted)

These remain unaddressed but are non-blocking for implementation:

**L-1: heartbeat uptime_seconds precision** — minor cosmetic; resolved as int.
**L-4: threshold table manual-webhook row** — already correct; no fix needed.
**L-6: breaker trip not separately logged in SQLite** — accepted out of scope; bounce rows allow reconstruction.

## Resolved Issues

### Iteration 1 (27 of 35)
See above-section in the v1.2 changelog for the full list. All CRITICAL, HIGH, and 10 of 14 MEDIUM findings were resolved.

### Iteration 2 (5 of 6)

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| M-Open-2 | MED | PR1 task list references old `rm -rf /run/taptap` wording | Tasks updated to match new contents-only glob |
| M-Open-3 | MED | PR2 task list missing new requirements (BOUNCE_TOKEN, env vars, FR-3.9b, etc.) | Expanded with explicit task-level callouts including unit test additions |
| M-Open-4 | MED | PR3 task list missing secrets.yaml and value_template steps | Tasks updated to include the secrets.yaml block, sensor configuration, and an extra auth test |
| L-Open-1 | LOW | Edge Cases referenced "not specified above as a separate FR" | Updated to reference FR-3.9b explicitly |
| P2-1 | LOW | Threshold table "heartbeat resumes" was conceptually confused | Reworded to "CCA state resumes" with the actual recovery semantics |
| P2-2 | LOW | FastAPI `Path(regex=...)` is deprecated | Updated to `Path(pattern=...)` plus exception handler note for 422→404 remap |

## Verification of critical user constraints (post-fix)

✅ **State files NEVER touched** — NFR-1.1 unchanged; new `./watchdog-data:/data` volume is dedicated, never overlaps `tigo-mqtt/data/{primary,secondary}`.
✅ **HA notifications NOT critical/time-sensitive** — FR-4.3, 4.4, 4.5, 4.5b all reference the same non-critical notification level. Mermaid diagram updated.
✅ **Watchdog is FIRST responder; HA reacts post-fact** — FR-4 design intent is clear; sequence diagram says "T+5min: watchdog is the FIRST responder".
✅ **Watchdog does NOT bounce on broker outage** — FR-3.12 expanded to handle short-vs-long disconnect explicitly.
✅ **docker-socket-proxy with CONTAINERS+POST only** — NFR-1.2 retains this; expanded with explicit network topology.
✅ **Dashboard placement in Panels view, vertical-stack wrap** — FR-4.6 unchanged (was already correct).
