# Review: Tigo MQTT Self-Healing System

## Review Status
- **Spec:** docs/specs/2026-05-02-tigo-mqtt-self-healing.md
- **Started:** 2026-05-02
- **Last Updated:** 2026-05-02 (post-pass-3 fixes; spec at v1.4)
- **Iteration:** 3 of 5 — COMPLETE
- **Status:** READY (3 LOW findings from pass 1+2 accepted; pass 3 found 4 fixed + 3 accepted-LOW)

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 2        |
| HIGH     | 0    | 9        |
| MEDIUM   | 0    | 16       |
| LOW      | 6    | 9        |

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 35    | 27       | 0   | Initial full pass |
| 2    | 6     | 5        | 0   | PR task lists, Edge Cases ref, regression sweep |
| 3    | 7     | 4        | 0   | v1.3 diff review — placeholders, FR-5.3/5.4/5.5, PR 4 |

## Open Issues (accepted)

These remain unaddressed but are non-blocking for implementation:

**L-1: heartbeat uptime_seconds precision** — minor cosmetic; resolved as int.
**L-4: threshold table manual-webhook row** — already correct; no fix needed.
**L-6: breaker trip not separately logged in SQLite** — accepted out of scope; bounce rows allow reconstruction.

### Pass 3 accepted-LOW (v1.3 review)

**P3-L-5: Premature documentation in PR 4 if PR 2/3 not yet shipped.** Accepted as-is. PR 4 description already acknowledges that the README "won't be true yet, but they describe what the system *will* do once PR 2 is deployed" — the trade-off favors letting the cleanliness sweep land independently rather than gating it on PR 2.

**P3-L-6: PR 4 task list does not explicitly require running FR-5.5 grep against newly added files.** Accepted as-is. Task 5 ("Run the FR-5.5 grep check on the entire tracked tree") implicitly covers the new files; an explicit per-file callout would be redundant.

**P3-L-7: Prose still references "broker on NAS" / "Mosquitto broker on NAS" in 5 places (motivation, NFR-1.2, edge cases, sequence diagram, architecture diagram, mapping prose).** Accepted as-is. The placeholder convention parameterizes the *value* (`<MQTT_BROKER_HOST>`); the topology assumption ("the broker happens to be on a NAS in this deployment") is descriptive context, not a hardcoded value. Operators with a different topology substitute as needed; this is consistent with the existing changelog framing of v1.3 as "the values are placeholdered, the deployment description is left as-is".

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

### Iteration 3 (4 of 7) — v1.3 review

| ID | Severity | Description | Resolution |
|----|----------|-------------|------------|
| P3-1 | MED | FR-5.3 README env-var list incorrectly includes `MQTT_CLIENT_ID` (taptap-only var) and omits `PRIMARY_CONTAINER`/`SECONDARY_CONTAINER`/`WEBHOOK_PORT` from NFR-5.1 | Rewritten to require alignment with NFR-5.1's authoritative table; called out `MQTT_CLIENT_ID` as belonging to the taptap section, not watchdog |
| P3-2 | MED | FR-5.5 grep regex misses RFC1918 `172.16-31.x.x`, `*.local` mDNS, `/Volumes/`; documented as catching all IPs but only catches two of three private ranges | Extended regex to cover all three RFC1918 ranges, `/Volumes/`, and `*.local`. PR 4 task 5 grep updated to match. Known limitations explicitly documented (SSH aliases, public IPs, foreign domains) |
| P3-3 | LOW | Architecture diagram ASCII box borders misaligned after v1.3 placeholder substitution (`<MQTT_BROKER_HOST>:1883` is 23 chars vs original 18; `<HA_HOST>:8123` is 14 chars vs original 17) — top box was 75 wide instead of 70; HA box was 21 instead of 24 | Re-aligned both boxes by adjusting trailing space; replaced "Mosquitto broker on NAS" with "Mosquitto broker on host" in the diagram for consistency with placeholder convention |
| P3-4 | LOW | PR 4 task 4 ("Update docs/TROUBLESHOOTING.md per FR-5.2") implicitly duplicates ownership with PR 1 task 2 (which adds the FR-1.2 entry to the same file) | Task 4 reworded to scope it to only the FR-5.2 watchdog/HA entries, with an explicit cross-reference noting the FR-1.2 entry is owned by PR 1 |

## Verification of critical user constraints (post-pass-3)

All six critical constraints continue to hold after v1.3 + pass-3 fixes:

✅ **State files NEVER touched** — NFR-1.1 unchanged; v1.3 changes were purely documentation/cleanup; v1.4 changes touched only FR-5.x and the architecture diagram. No new code paths near `tigo-mqtt/data/`.
✅ **HA notifications NOT critical/time-sensitive** — FR-4.3, 4.4, 4.5, 4.5b unchanged. The phrase "Same non-critical notification level as FR-4.3" appears in 4.4, 4.5, 4.5b.
✅ **Watchdog is FIRST responder; HA reacts post-fact** — FR-4 "Design intent" paragraph and sequence diagram unchanged.
✅ **Watchdog does NOT bounce on broker outage** — FR-3.12 unchanged.
✅ **docker-socket-proxy with CONTAINERS+POST only** — NFR-1.2 unchanged.
✅ **Dashboard placement in Panels view, vertical-stack wrap** — FR-4.6 unchanged (only the placeholder `<HA_DASHBOARDS_DIR>` substituted for the previous absolute path; the wrap structure is identical).
