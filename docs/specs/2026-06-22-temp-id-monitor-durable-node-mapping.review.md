# Review Log — Temp ID Monitor Durable node_id → serial Mapping

Adversarial review of `2026-06-22-temp-id-monitor-durable-node-mapping.md`. Each pass was an independent skeptic that verified every claim against the actual code in the worktree. Loop ran until a pass returned no BLOCKER/MAJOR findings.

## Pass 1 — verdict: CONVERGED (no material findings); 3 MINORs folded in

Verified by executing the regexes against the real log lines, tracing the dashboard consumer, and checking env-var collisions / counts:
- `ALREADY_ENUM_PATTERN` extracts `('65','4-C3F222W')` and does not false-positive on perm/temp/telemetry/sensor-reset lines; `PERM_SERIAL_PATTERN` still works and is disjoint.
- The monitor reads **no** state file today → `CACHE_DIR`/`REPUBLISH_INTERVAL`/`PRIMARY_STATE_FILE`/`SECONDARY_STATE_FILE` are net-new names with no collision.
- Dashboard joins on serial (`mqtt_client.py:97-98,203-226` → `panel_service.py:411-456`, line 439); payload `{node_id: serial}` unchanged → no consumer change.
- `gateway_node_tables` cross-check valid; 47/22 counts match CLAUDE.md.

MINORs folded in: (1) no `tests/` dir exists → FR-6.0 added (PR-1 creates the harness); (2) `temp-id-monitor-data/` gitignore made an explicit PR-2 task; (3) FR-2.3 tightened to gate writes/publishes on `merge()` returning True (no per-poll write storm).

## Pass 2 — verdict: 1 BLOCKER + 2 MAJOR + MINORs; all fixed

- **BLOCKER** FR-5.2: the blocking `async for line in process.stdout` (`:206`) can't service a wall-clock timer; spec never said to restructure. → Added FR-5.2.1 mandating `readline()` + `asyncio.wait_for(timeout=REPUBLISH_INTERVAL)` (or a background task); bare async-for + line-arrival timer declared non-compliant.
- **MAJOR** FR-4.2/FR-5.2 "re-publish" vs "re-scan" contradiction. → FR-5.2 = re-publish in-memory map + cross-check, no `docker logs` re-scan; FR-4.2 reworded to "periodic re-publish/cross-check tick".
- **MAJOR** FR-2.2 "publish on load" undraweable (no MQTT client until `:177`) and risked re-introducing the empty-clobber. → FR-2.2 reworded (load before scan; replace the unconditional connect-time `node_mappings` publish at `:185` with gated `publish_mappings_if_present`); FR-3.5 codifies it; Mermaid moved publish to after connect.
- MINORs: FR-5.1 backoff-reset clock defined via monotonic entered-timestamp; FR-3.6 documents the intentional qos 0→1.

## Pass 3 — verdict: CONVERGED (no material findings)

Re-verified all four Pass-2 fixes resolved and consistent; confirmed cited line refs against `temp_id_monitor.py` (`:177` client open, `:184-185` connect-time publishes, `:206` async-for, `:118` qos-0 publish). Two cosmetic MINORs folded in: Mermaid idle-tick moved inside the follow loop as an `alt new line / readline timeout`; `:184-185` citations narrowed to `:185` (temp_nodes at `:184` is out of scope per FR-3.4).

**Result:** converged at v1.0, ready for implementation.
