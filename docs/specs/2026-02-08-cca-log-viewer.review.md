# Review: CCA Log Viewer

## Review Status
- **Spec:** docs/specs/2026-02-08-cca-log-viewer.md
- **Started:** 2026-02-08
- **Last Updated:** 2026-02-08
- **Iteration:** 4 of 5
- **Status:** COMPLETE

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 2        |
| HIGH     | 0    | 11       |
| MEDIUM   | 0    | 15       |
| LOW      | 0    | 5        |

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 18    | 18       | 0   | Full review (all RC criteria) |
| 2    | 10    | 10       | 0   | Code sample validation, internal consistency |
| 3    | 5     | 5        | 0   | Code sample completeness, variable scoping, lifecycle management |
| 4    | 0     | 0        | 0   | Verification pass — all clear |

## Open Issues
(none)

## Resolved Issues

### Iteration 1

**RC-3-001 (CRITICAL):** MQTT client not available during Phase 1 — Restructured Log Publisher with MQTT lifecycle wrapping both phases.
**RC-3-002 (HIGH):** Sync file I/O in async context — Changed ingest() to async with asyncio.to_thread().
**RC-1-001 (HIGH):** Ambiguous timestamps — Clarified capture time semantics.
**RC-6-001 (HIGH):** In-memory store inconsistencies — Removed deque import, fixed diagram.
**RC-5-001 (HIGH):** No pruning schedule — Added _pruning_loop() with asyncio.sleep.
**RC-3-003 (HIGH):** Fragile VITE_WS_URL — Changed to regex pattern.
**RC-5-002 (HIGH):** Mock mode undefined — Added FR-5.4.
**RC-3-004 (MEDIUM):** Missing constructor signature — Expanded MQTT Integration section.
**RC-6-002 (MEDIUM):** Phase 1→2 gap — Addressed via last_historical_ts.
**RC-5-003 (MEDIUM):** URL params missing — Added FR-4.12.
**RC-13-001 (MEDIUM):** WS error handling — Updated with try/except/finally.
**RC-10-001 (MEDIUM):** REST API ambiguities — Expanded FR-3.4 with param table.
**RC-16-001 (MEDIUM):** Missing directory guard — Added mkdir and exists checks.
**RC-2-001 (MEDIUM):** Testing gaps — Expanded from 5 to 10 scenarios.
**RC-15-001 (MEDIUM):** Accessibility — Added FR-4.13 with ARIA requirements.
**RC-4-001 (MEDIUM):** NFR-1.4 flush ambiguous — Clarified f.flush() vs os.fsync().
**RC-1-002 (LOW):** Scroll behavior — Specified dual behavior at top vs scrolled.
**RC-7-001 (LOW):** Dashboard ternary — Added restructuring note.

### Iteration 2

**RC-6-001 (CRITICAL):** In-memory append in static method — Moved in-memory append and broadcast call back to ingest() method. Added _broadcast_entry() and connection management methods.
**RC-6-002 (HIGH):** Missing add/remove_connection methods — Added add_connection(), remove_connection(), and _broadcast_entry() methods to LogService.
**RC-3-001 (HIGH):** Changed MQTTClient param types — Changed to only describe the new on_log parameter, added note not to change existing params.
**RC-6-003 (HIGH):** Dropped error handling — Added implementation notes about preserving existing error handling, decode errors="replace", and Phase 1/2 enumeration behavior.
**RC-3-002 (MEDIUM):** Double JSON decode — Fixed payload routing to use already-decoded dict directly.
**RC-3-003 (MEDIUM):** Contradictory WS pattern — Removed reference to matching /ws/panels, described the improved pattern directly.
**RC-6-004 (MEDIUM):** Mock mode LogService placement — Added explicit lifespan ordering showing LogService creation before mock check.
**RC-6-005 (MEDIUM):** Missing MQTT credentials — Updated Client constructor to use keyword args with credentials.
**RC-3-004 (MEDIUM):** Unclear Phase 1/2 enumeration — Added explicit notes about Phase 1 vs Phase 2 enumeration behavior.
**RC-6-006 (LOW):** Inaccurate WS URL comment — Updated comment to reflect actual codebase usage.

### Iteration 3

**RC-3-001 (HIGH):** `_pruning_loop` missing from LogService class — Added `_pruning_loop` method to LogService class code sample; updated FR-2.4 to reference class method instead of duplicating code.
**RC-6-001 (HIGH):** `log_service` scoping not specified — Added module-level global declaration and `global log_service` in lifespan, matching existing `mqtt_client` pattern.
**RC-16-001 (MEDIUM):** Missing `pruning_task` cancellation on shutdown — Added cleanup code showing `pruning_task.cancel()` in lifespan shutdown section.
**RC-3-002 (LOW):** Missing `WebSocket` import in LogService — Added `from fastapi import WebSocket` and `logging` imports to LogService code sample.
**RC-3-003 (LOW):** Ambiguous `if` vs `elif` for log handler — Changed to `elif` and clarified it must be inserted before the existing `else` clause in the if/elif chain.
