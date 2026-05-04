# Home Assistant integration for the Tigo watchdog

These YAML files implement FR-4 of the tigo-mqtt self-healing spec
(`docs/specs/2026-05-02-tigo-mqtt-self-healing.md`). They surface the
watchdog's state and events as HA sensors, automations, and dashboard
buttons.

The files here are **templates** — operator-specific values
(`<PI_HOST>`, `<NOTIFY_SERVICE>`, the bounce token) live in HA's
`secrets.yaml` and are referenced via `!secret`.

## What's in here

| File | Purpose |
|---|---|
| `sensors.yaml` | Three MQTT sensors tracking last-seen times for each CCA + watchdog heartbeat (FR-4.1). |
| `binary_sensors.yaml` | Three template binary_sensors that flip `on` when staleness thresholds are exceeded (FR-4.2). |
| `automations.yaml` | Four automations: unrecovered, bounce-confirmation, circuit-breaker, watchdog-dead (FR-4.3 to FR-4.5b). |
| `rest_commands.yaml` | Two `rest_command` entries for the manual bounce buttons (FR-4.7). |
| `input_booleans.yaml` | Four notification opt-out booleans, all default `on` (FR-4.8). |
| `secrets.yaml.example` | Template secrets entries for HA's `secrets.yaml` (FR-4.7). |
| `dashboard-panels-extension.yaml` | The `vertical-stack` block to splice into the Panels view of `solar_dashboard.yaml` (FR-4.6). |

## Deploy procedure (Phase 3)

1. **Substitute the notify service.** The automations reference
   `notify.<NOTIFY_SERVICE>`. Discover the operator's mobile_app entity via:
   ```sh
   python3 dashboards/scripts/query_entities.py --filter mobile_app
   ```
   Replace `<NOTIFY_SERVICE>` in `automations.yaml` accordingly, or set it
   via `!secret tigo_notify_service`.

2. **Append the secrets.** Add the entries from `secrets.yaml.example` to
   HA's `secrets.yaml`, substituting:
   - `<PI_HOST>` from `.claude/env`
   - `<BOUNCE_TOKEN>` from `tigo-mqtt/.env` on the Pi
   - `<NOTIFY_SERVICE>` discovered above

3. **Place the YAML.** The exact include pattern depends on the operator's
   HA layout. Typical layouts:
   - `mqtt:` block from `sensors.yaml` → merged into `configuration.yaml`'s
     existing `mqtt:` block (HA only allows ONE mqtt: block at the root).
   - `template:` block from `binary_sensors.yaml` → merged into
     `configuration.yaml`'s `template:` block.
   - `automations.yaml` → appended to the operator's `automations.yaml` (or
     included via `automation: !include automations.yaml`).
   - `rest_commands.yaml` → merged into `configuration.yaml`'s
     `rest_command:` block.
   - `input_booleans.yaml` → merged into `configuration.yaml`'s
     `input_boolean:` block.

4. **Splice the dashboard.** Edit `<HA_DASHBOARDS_DIR>/solar_dashboard.yaml`,
   find the Panels view (`path: panels`, `type: panel`), and replace the
   single `cards:` entry with the `vertical-stack` block from
   `dashboard-panels-extension.yaml`. The watchdog spec FR-4.6 places the
   bounce buttons at the bottom of the Panels view, after the iframe.

5. **Reload HA.** Either via UI (Developer Tools → YAML → reload affected
   integrations) or `homeassistant.restart`.

6. **Smoke test.** Tap the manual bounce button on the Panels page. Verify
   the watchdog's `taptap-watchdog` container logs show a 200, that
   `taptap-primary` actually restarts, and that the MQTT event arrives at
   HA. Disable the alerts via the input_booleans before testing
   intentional silence.
