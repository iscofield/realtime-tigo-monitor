**Status:** Draft
**Date:** 2026-06-22

> **Placeholder convention.** This spec is checked into a public GitHub repository. Environment-specific values are written as angle-bracketed placeholders that the implementer substitutes from `.claude/env`, `secrets.yaml`, or compose env files at deploy time. None of these values are committed in plaintext.
>
> | Placeholder | Meaning | Source |
> |---|---|---|
> | `<PI_HOST>` | LAN IP/hostname of the Raspberry Pi running tigo-mqtt | `.claude/env` `PI_HOST` |
> | `<MQTT_BROKER_HOST>` | LAN IP/hostname of the MQTT broker | `tigo-mqtt/.env` `MQTT_SERVER` |

# Temp ID Monitor — Durable node_id → serial Mapping

The `temp-id-monitor` sidecar publishes the `taptap/<system>/node_mappings` retained MQTT topic that the dashboard uses to label each panel with its CCA node id. This spec makes that mapping **durable**: it is learned from the log lines taptap *always* emits (not only the rare enumeration events), **persisted** to a regenerable cache so it survives restarts/log-rotation/log-level changes, and **never regressed** to empty over a known-good value. The fix is confined to the sidecar — no taptap restart, no exposure of the irreplaceable `taptap.state` files.

## Motivation

Since **2026-05-15** the dashboard has shown **0 of 47** primary panels matched to a node id (secondary's 22 are fine). Root-cause investigation (2026-06-21) established:

1. **The map is reconstructed only from rare lines.** The monitor recognizes one log pattern — `Permanently enumerated node id: N … serial: S` — which taptap emits **only at a fresh enumeration event** (startup-from-state or a new infrastructure report). In steady state taptap instead emits, every poll, `Node id: N already enumerated to node name: 'X' and serial: 'Y'`, which the monitor ignores.
2. **Recovery depends on a log-tail window.** On each (re)start the monitor scans only the last `HISTORY_TAIL_LINES` (2000) lines. Primary's telemetry volume burns through 2000 lines in well under a minute, so the rare enumeration lines rotate out and are never recovered. A `docker logs -f` blip on 2026-05-15 reset the in-memory map to empty during exactly such a window.
3. **An empty map clobbers a good one.** On that reset the monitor published `node_mappings: {}` (retained), overwriting the previously-correct retained value. It has been stuck at empty ever since because steady-state logs contain no pattern it recognizes.

Crucially, the **node_id ↔ serial relationship exists nowhere except taptap's log lines** (verified 2026-06-21): the `taptap/<system>/state` telemetry payload contains node *name* + serial but **no node_id** (grep count 0 in a 26 KB payload); no `taptap/<system>/nodes/#` per-node topics exist; and `taptap.state` holds node_id → *MAC*, not node_id → serial. Therefore parsing taptap logs is the only viable source, and the sidecar (which already owns the Docker socket and log parsing) is the correct place for it.

Impact today is limited to the **node-id label** (live power data flows by serial and is unaffected — 46/47 primary panels report power), but the mapping has been silently broken for over a month and will stay broken without this change.

## Background — Current Behavior (informative)

- **Component:** `tigo-mqtt/temp-id-monitor/temp_id_monitor.py`, an isolated sidecar with `network_mode: host` and a read-only Docker socket mount (`/var/run/docker.sock:ro`). One process supervises one async task per container (`taptap-primary`, `taptap-secondary`).
- **What it publishes (retained):** `taptap/<system>/temp_nodes`, `taptap/<system>/node_mappings`, and (non-retained) `taptap/<system>/logs`.
- **Consumer:** `dashboard/backend/app/mqtt_client.py` subscribes to `taptap/+/node_mappings` and joins `node_id → serial` against `panels.yaml` (serial is the join key) to populate each panel's `node_id`. The dashboard requires no change.
- **Observed log line formats (from `taptap-primary`, 2026-06-21):**
  - Steady state, every poll, DEBUG: `2026-06-21 11:37:04.373 DEBUG: Node id: 65 already enumerated to node name: 'D7' and serial: '4-C3F222W'`
  - Fresh enumeration, rare: `Permanently enumerated node id: 42 to node name: A7 device serial: 4-C3F23CR`
- **Current patterns (`temp_id_monitor.py` lines 81–87):** `TEMP_PATTERN`, `PERM_PATTERN`, `PERM_SERIAL_PATTERN` — none match the steady-state `already enumerated` line.

## Functional Requirements

### FR-1 — Broaden enumeration parsing

- **FR-1.1** The monitor SHALL recognize the steady-state line and extract `(node_id, serial)` using a pattern equivalent to:
  `r"Node id: (\d+) already enumerated.*?serial[:\s]+'?([0-9A-Za-z-]+)'?"`
- **FR-1.2** The monitor SHALL continue to recognize the existing fresh-enumeration line via `PERM_SERIAL_PATTERN`.
- **FR-1.3** Both patterns SHALL be evaluated in **both** the startup history scan and the live-follow loop.
- **FR-1.4** Extracted serials SHALL be stored without surrounding quotes; `node_id` SHALL be stored as a string key (consistent with the existing `node_mappings: Dict[str, str]` shape). Serials match `[0-9A-Za-z-]+`.
- **FR-1.5** When a parsed `(node_id, serial)` is new or differs from the in-memory value, the monitor SHALL update the map and trigger a publish, subject to FR-3 gating.
- **FR-1.6** Parsing SHALL run on every line regardless of the existing `sensor_reset` log-filtering (which only affects the `/logs` topic), preserving current behavior.

### FR-2 — Persist the learned map

- **FR-2.1** The monitor SHALL maintain a per-system persistent cache mapping `node_id → serial` at a configurable path (default `/data/node_serials_<system>.json`), backed by a host volume **distinct from** the `taptap.state` data directory.
- **FR-2.2** On startup, before scanning logs, the monitor SHALL load the cache into the in-memory map and, if non-empty, publish it immediately (FR-3) so the retained `node_mappings` value is restored without waiting for new log lines.
- **FR-2.3** On every change to the in-memory map, the monitor SHALL atomically rewrite the cache file (write temp file in the same directory, then `os.replace`).
- **FR-2.4** The cache file SHALL be JSON of the form:
  ```json
  { "schema_version": 1, "system": "primary", "updated_at": "<ISO8601 UTC>", "mappings": { "65": "4-C3F222W" } }
  ```
  A missing, unreadable, or schema-mismatched cache SHALL cause the monitor to start with an empty map, log a WARNING, and continue (never crash).
- **FR-2.5** The cache is **regenerable**. Losing it SHALL only trigger re-learning from logs; it SHALL NOT be treated as critical state.

### FR-3 — No-clobber publish semantics

- **FR-3.1** The monitor SHALL NOT publish an empty `node_mappings` map. A `node_mappings` publish SHALL occur only when the map contains ≥ 1 entry.
- **FR-3.2** Within a run the in-memory map SHALL only grow or update entries; an entry SHALL be removed only when a newer enumeration line reassigns the same `node_id` to a different serial (an update, not a deletion). The map SHALL NOT silently shrink.
- **FR-3.3** Together with FR-2.2 and FR-3.1, the retained `node_mappings` value SHALL never regress from a known-good state to empty across restarts, log-rotation, or a change of taptap `LOG_LEVEL`.
- **FR-3.4** FR-3 applies to `node_mappings` only. `temp_nodes` publishing is unchanged and MAY be empty (temp nodes are transient).

### FR-4 — State-file completeness cross-check (read-only, observability)

- **FR-4.1** The monitor MAY read the system's `taptap.state` file **read-only** (path via env, e.g. `PRIMARY_STATE_FILE`/`SECONDARY_STATE_FILE`) to obtain the authoritative set of `node_id`s.
- **FR-4.2** On startup and on each periodic re-scan (FR-5.2), the monitor SHALL compare learned `node_id`s against the state file's `node_id` set and log a WARNING enumerating any **missing** (authoritative but not learned) or **extra** (learned but not authoritative) ids, including counts (e.g. "primary: learned 47/47").
- **FR-4.3** The monitor SHALL NEVER write, truncate, move, lock, or otherwise modify `taptap.state`. Any mount of the state directory SHALL be read-only.
- **FR-4.4** If the state file is absent or unparseable, the cross-check SHALL be skipped (log INFO) without crashing. The cross-check is observability only.
- **FR-4.5** The cross-check SHALL NOT auto-prune cache entries in this version (avoids dropping valid entries on a transient state read). Reconciliation is explicitly out of scope (see Out of Scope).

### FR-5 — Loop hardening

- **FR-5.1** The per-container restart delay SHALL use exponential backoff (initial 5 s, doubling, capped at 60 s), resetting to the initial delay after a sustained healthy follow period (default 120 s of uninterrupted streaming).
- **FR-5.2** The monitor SHALL periodically (default every 300 s, configurable) re-publish the current non-empty map (idempotent retained publish) and run the FR-4 cross-check, as a safety net against missed live lines or a dropped retained message.
- **FR-5.3** `HISTORY_TAIL_LINES` SHALL remain configurable. With FR-1 and FR-2, recovery no longer depends on the tail window containing fresh-enumeration lines.
- **FR-5.4** A failure in one container's monitor task SHALL NOT terminate sibling tasks or the process; each task self-supervises and always restarts.

### FR-6 — Tests

- **FR-6.1** Unit tests SHALL assert both patterns extract the correct `(node_id, serial)` from the exact observed lines in Background, plus negative cases (non-enumeration lines, malformed serials).
- **FR-6.2** Unit tests SHALL cover cache round-trip, atomic write, missing file, and malformed/schema-mismatched file.
- **FR-6.3** Unit tests SHALL assert the no-clobber gating: an empty map is never published; the map never shrinks; a serial reassignment updates in place.
- **FR-6.4** Unit tests SHALL cover the cross-check warning logic (missing/extra ids) against an in-memory fake state, without touching a real `taptap.state`.

## Non-Functional Requirements

- **NFR-1 — State-file safety.** The monitor SHALL never write `taptap.state`; the state directory mount (if any) SHALL be `:ro`. (Mirrors the self-healing spec's NFR-1.1.)
- **NFR-2 — Isolation / deployability.** Deploying or recovering SHALL require only rebuilding the sidecar image and `docker compose up -d temp-id-monitor`; it SHALL NOT require restarting `taptap-*` or recreating any volume holding `taptap.state`.
- **NFR-3 — Backward compatibility.** The topic `taptap/<system>/node_mappings` and its payload shape (`{node_id: serial}`) SHALL be unchanged. The dashboard SHALL require no code change.
- **NFR-4 — Log-level resilience.** The mapping SHALL remain populated whether taptap runs at `LOG_LEVEL=info` or `debug` (via the persistent cache + capture of `Permanently enumerated` lines at each taptap startup).
- **NFR-5 — Footprint.** The cache SHALL be < 10 KB/system; writes are atomic and infrequent (only on change). Container log volume SHALL remain bounded by the existing `json-file` `max-size`.
- **NFR-6 — Idempotency.** Retained re-publishes (FR-5.2) SHALL cause no dashboard disruption (the dashboard reconciles a full map each time).
- **NFR-7 — Observability.** The monitor SHALL emit structured log lines for: cache load (count), each publish (count), cross-check result, and backoff transitions.

## High Level Design

```mermaid
sequenceDiagram
    autonumber
    participant TT as taptap-<system> (logs)
    participant ST as taptap.state (read-only)
    participant M as temp-id-monitor
    participant C as node_serials_<system>.json (cache)
    participant B as MQTT broker
    participant D as Dashboard backend

    Note over M: Startup
    M->>C: load cache
    C-->>M: {node_id: serial} (may be empty)
    alt cache non-empty
        M->>B: publish RETAINED node_mappings (FR-3.1)
    end
    M->>ST: read node_id set (FR-4)
    ST-->>M: authoritative node_ids
    M->>M: cross-check, WARN if incomplete
    M->>TT: docker logs --tail N (history scan)
    TT-->>M: lines (PERM + "already enumerated")
    M->>M: merge into map (grow/update only)
    M->>C: atomic save (on change)
    M->>B: publish RETAINED node_mappings (if changed)

    Note over M: Steady state (follow)
    loop docker logs -f
        TT-->>M: new line
        M->>M: parse; if new/changed mapping
        M->>C: atomic save
        M->>B: publish RETAINED node_mappings
    end

    Note over M: Every 300s (safety net, FR-5.2)
    M->>B: re-publish current non-empty map
    M->>ST: re-run cross-check (WARN only)

    B-->>D: retained node_mappings → panels gain node_id
```

### Pattern additions (`temp_id_monitor.py`)

```python
# Steady-state line taptap logs every poll for each enumerated node:
#   "Node id: 65 already enumerated to node name: 'D7' and serial: '4-C3F222W'"
ALREADY_ENUM_PATTERN = re.compile(
    r"Node id: (\d+) already enumerated.*?serial[:\s]+'?([0-9A-Za-z-]+)'?"
)

def parse_mapping(line: str) -> tuple[str, str] | None:
    """Return (node_id, serial) from any enumeration line, else None."""
    if m := PERM_SERIAL_PATTERN.search(line):
        return m.group(1), m.group(2)
    if m := ALREADY_ENUM_PATTERN.search(line):
        return m.group(1), m.group(2)
    return None
```

### Cache load/save (atomic)

```python
def load_cache(path: Path) -> dict[str, str]:
    try:
        doc = json.loads(path.read_text())
        if doc.get("schema_version") == 1 and isinstance(doc.get("mappings"), dict):
            return {str(k): str(v) for k, v in doc["mappings"].items()}
        logger.warning(f"{path}: unexpected schema; starting empty")
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.warning(f"{path}: unreadable ({e}); starting empty")
    return {}

def save_cache(path: Path, system: str, mappings: dict[str, str]) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({
        "schema_version": 1, "system": system,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "mappings": mappings,
    }))
    os.replace(tmp, path)  # atomic within same dir
```

### No-clobber publish gate

```python
async def publish_mappings_if_present(mqtt, system, mappings):
    if not mappings:           # FR-3.1: never publish empty
        return
    await mqtt.publish(f"{MQTT_TOPIC_PREFIX}/{system}/node_mappings",
                       json.dumps(mappings), qos=1, retain=True)
    logger.info(f"Published node_mappings for {system}: {len(mappings)} nodes")
```

### Merge discipline (FR-3.2)

```python
def merge(mappings: dict[str, str], node_id: str, serial: str) -> bool:
    """Grow/update only. Returns True if changed."""
    if mappings.get(node_id) == serial:
        return False
    mappings[node_id] = serial   # never delete here
    return True
```

### Compose change (deployed `docker-compose.yml`, mirrored in `docker-compose.sample.yml`)

```yaml
  temp-id-monitor:
    # ...existing...
    environment:
      - CACHE_DIR=/data
      - REPUBLISH_INTERVAL=300
      # read-only state cross-check (optional but recommended)
      - PRIMARY_STATE_FILE=/state/primary/taptap.state
      - SECONDARY_STATE_FILE=/state/secondary/taptap.state
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./temp-id-monitor-data:/data                       # NEW: regenerable cache
      - ./data/primary:/state/primary:ro                   # NEW: read-only state cross-check
      - ./data/secondary:/state/secondary:ro
```

`tigo-mqtt/temp-id-monitor-data/` SHALL be git-ignored (mirrors `watchdog-data/`).

## Failure Modes & Edge Cases

| Scenario | Required behavior |
|---|---|
| Cache missing on first deploy | Start empty; learn from logs; publish once ≥1 mapping (FR-3.1). Never publish empty. |
| Cache corrupt/partial | WARN, start empty, continue; cache rewritten on next change (FR-2.4). |
| `docker logs -f` stream ends repeatedly | Exponential backoff (FR-5.1); cache keeps retained value populated meanwhile. |
| taptap switched to `LOG_LEVEL=info` | `already enumerated` (DEBUG) vanish; map still served from cache and refreshed at each taptap startup via `Permanently enumerated` (FR-2, NFR-4). |
| node_id reassigned to a new serial (re-enumeration) | Entry updated in place (FR-3.2); cache rewritten; republished. |
| State file absent/locked/unreadable | Cross-check skipped (FR-4.4); never blocks publishing; never written (FR-4.3). |
| Two container tasks writing cache | Per-system files (FR-2.1) — no shared-file race. |
| Dashboard restart | Reads retained `node_mappings` (now always populated) — no dependency on monitor timing. |

## Out of Scope

- Auto-reconciliation/pruning of cache entries against `taptap.state` (FR-4.5) — observability only in v1.
- Any change to the taptap binary or to `taptap-mqtt` (would fork upstream and gains no new data source).
- Per-node MQTT topics or adding `node_id` to the `/state` payload (not viable: `node_id` is not present in any MQTT payload).
- Dashboard/front-end changes (NFR-3: topic/payload unchanged).

## Task Breakdown

1. **Parsing + no-clobber (PR 1).** Add `ALREADY_ENUM_PATTERN` + `parse_mapping`; apply in history scan and live-follow; implement `merge` (grow/update only) and the empty-map publish gate (FR-1, FR-3). Unit tests FR-6.1, FR-6.3. *This alone restores primary at the current debug log level.*
2. **Persistence (PR 2).** Add `load_cache`/`save_cache`; load-before-scan and publish-on-load; atomic writes; `CACHE_DIR` env; add `temp-id-monitor-data` volume to sample + deployed compose; git-ignore it (FR-2). Unit tests FR-6.2.
3. **State cross-check + loop hardening (PR 3).** Read-only state cross-check with WARN (FR-4); exponential backoff + periodic re-publish (FR-5). Add `:ro` state mounts + `REPUBLISH_INTERVAL` env. Unit tests FR-6.4.
4. **Deploy + verify.** Rebuild only the sidecar on the Pi and restart it; verify (no taptap restart):
   - `curl`-free MQTT check from the Pi: `mosquitto_sub -h <MQTT_BROKER_HOST> -t 'taptap/primary/node_mappings' -C 1` shows 47 entries; secondary shows 22.
   - Dashboard `/api/panels` shows `primary: 47 panels, 47 with node_id`.
   - Cache file exists at `tigo-mqtt/temp-id-monitor-data/node_serials_primary.json` with 47 mappings.
   - Restart the sidecar; confirm it republishes 47 from cache **before** any new log line (FR-2.2) and never logs a `0 nodes` publish.

## Related Specifications

| Spec | Relationship | Notes |
|------|--------------|-------|
| [Tigo MQTT Self-Healing System](2026-05-02-tigo-mqtt-self-healing.md) | related | Same sidecar family on the Pi; source of the NFR-1 state-file-safety and sidecar-isolation patterns reused here. |
| [Disk-Backed Log Storage](2026-02-09-disk-backed-log-storage.md) | related | The dashboard persists the `/logs` stream this monitor publishes; independent of `node_mappings`. |
| [CCA Log Viewer](2026-02-08-cca-log-viewer.md) | related | Consumes `taptap/<system>/logs` and `temp_nodes` published by this monitor. |

## Context / Documentation

- `tigo-mqtt/temp-id-monitor/temp_id_monitor.py` — the sidecar to modify.
- `tigo-mqtt/temp-id-monitor/tests/` — unit test location.
- `tigo-mqtt/docker-compose.sample.yml` — `temp-id-monitor` service definition (volumes, env, socket).
- `dashboard/backend/app/mqtt_client.py`, `dashboard/backend/app/panel_service.py` — the consumer (`_process_node_mappings`, panel/node_id join).
- `CLAUDE.md` → "CRITICAL: TapTap State Files" — why `taptap.state` is read-only here.
- Investigation evidence (2026-06-21): retained `node_mappings` primary=0/secondary=22; `state` payload has 0 `node_id`; only topics under `taptap/primary/` are `state, logs, lwt, node_mappings, temp_nodes`.

---

**Specification Version:** 1.0
**Last Updated:** June 2026
**Authors:** Ian Scofield (with Claude Code)

## Changelog

### v1.0 (June 2026)
**Summary:** Initial specification

**Changes:**
- Initial specification for durable, persisted, no-clobber `node_id → serial` mapping in the temp-id-monitor sidecar.
