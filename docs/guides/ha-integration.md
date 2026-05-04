# Home Assistant Integration for the Tigo Watchdog

This guide wires the `taptap-watchdog` (FR-4 of the self-healing spec) into Home Assistant so the operator gets:

- **Non-critical** mobile notifications when the watchdog bounces a CCA, when bounces stop helping (circuit breaker trips), when a CCA stays silent past the 7-minute mark (watchdog didn't recover it), and when the watchdog itself dies.
- **Manual bounce buttons** on the Panels dashboard view, intentionally placed at the bottom of the page so they're out of the way (ideally never used).

The HA YAML lives in `tigo-mqtt/ha-integration/` in this repo as templates with placeholder values. The deploy step substitutes operator-specific values from `secrets.yaml` and pushes to the running HA instance.

## What you'll need

- [ ] Home Assistant running and reachable from your workstation
- [ ] An MQTT broker reachable from HA (typically the same broker the taptap containers publish to)
- [ ] `taptap-watchdog` running on the Pi (see `tigo-mqtt/watchdog/README.md`)
- [ ] `BOUNCE_TOKEN` from the Pi's `tigo-mqtt/.env` (matches the watchdog's `BOUNCE_TOKEN` env var)
- [ ] `<PI_HOST>` — the Pi's LAN IP/hostname
- [ ] Your `notify.mobile_app_<device>` entity name (discover via `python3 dashboards/scripts/query_entities.py --filter mobile_app` or HA → Developer Tools → States)

## Files in this integration

| File (in `tigo-mqtt/ha-integration/`) | Where it goes in HA |
|---|---|
| `sensors.yaml` | merge into the `mqtt:` block of `configuration.yaml` |
| `binary_sensors.yaml` | merge into the `template:` block of `configuration.yaml` |
| `automations.yaml` | append to the operator's `automations.yaml` |
| `rest_commands.yaml` | merge into the `rest_command:` block of `configuration.yaml` |
| `input_booleans.yaml` | merge into the `input_boolean:` block of `configuration.yaml` |
| `secrets.yaml.example` | append to `secrets.yaml` (NEVER committed if it has real values) |
| `dashboard-panels-extension.yaml` | splice into the Panels view of `<HA_DASHBOARDS_DIR>/solar_dashboard.yaml` |

## Step 1: Add the secrets

Append to HA's `secrets.yaml`:

```yaml
tigo_bounce_primary_url:   "http://<PI_HOST>:8080/bounce/primary"
tigo_bounce_secondary_url: "http://<PI_HOST>:8080/bounce/secondary"
tigo_bounce_token:         "<BOUNCE_TOKEN>"      # from tigo-mqtt/.env on the Pi
tigo_notify_service:       "<NOTIFY_SERVICE>"    # e.g. mobile_app_iphone
```

`secrets.yaml` is NEVER committed if it contains real values. The `BOUNCE_TOKEN` is a shared secret between the Pi and HA — leaking it would let any LAN device bounce the taptap containers.

## Step 2: Place the YAML

Open `tigo-mqtt/ha-integration/sensors.yaml`, `binary_sensors.yaml`, `rest_commands.yaml`, and `input_booleans.yaml`. Each file's top-level key (`mqtt:`, `template:`, `rest_command:`, `input_boolean:`) tells you which existing block in `configuration.yaml` to merge into. HA does not allow two `mqtt:` blocks at the root, so you must merge — don't append blindly.

`automations.yaml` from this directory can be appended to the operator's `automations.yaml`. Replace `<NOTIFY_SERVICE>` (4 occurrences) with your mobile_app entity, or change to `service: notify.{{ states('input_text.tigo_notify_service') }}` if you prefer a more dynamic approach.

## Step 3: Splice the dashboard

Find the Panels view in `<HA_DASHBOARDS_DIR>/solar_dashboard.yaml` (look for `path: panels`, `type: panel`). Replace the `cards:` list with the `cards:` from `dashboard-panels-extension.yaml`. The bounce buttons must be the LAST child of the `vertical-stack`, placing them visually below the iframe at the bottom of the page (intent: out of the way; ideally never clicked).

## Step 4: Reload HA

Either via the UI (Developer Tools → YAML → reload affected integrations) or via `homeassistant.restart`. Watch HA's `home-assistant.log` for any YAML parse errors — they show up immediately on reload.

## Step 5: Smoke test

1. **Heartbeat sensor.** In Developer Tools → States, verify `sensor.taptap_watchdog_last_seen` shows a recent timestamp and updates every 30 seconds.
2. **CCA last-seen sensors.** Verify `sensor.taptap_primary_last_seen` and `sensor.taptap_secondary_last_seen` update on every taptap state message.
3. **Manual bounce.** Tap one of the bounce buttons. Confirm the dialog. Verify:
   - HA logs `rest_command.taptap_bounce_primary` returned 200.
   - The watchdog's logs (`docker logs taptap-watchdog`) show a `manual_webhook` bounce.
   - The taptap container actually restarts (`docker ps --filter name=taptap-primary` shows a fresh STARTED time).
   - A `bounce` event appears at HA via the bounce-confirmation automation.
4. **Auth test.** Send a request without the header to confirm 401:
   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://<PI_HOST>:8080/bounce/primary
   # expected: 401
   ```
5. **Opt-out toggles.** Flip `input_boolean.tigo_bounce_alerts` off, trigger a bounce, confirm no notification arrives. Flip back to on.

## Notification priority

All four automations are intentionally **non-critical** (`interruption-level: active` on iOS, `importance: default` on Android). This is an explicit user requirement — escalation is via wording in the message body, not via notification importance. Don't change this without checking with the operator.

## Troubleshooting

If notifications don't arrive, see `docs/TROUBLESHOOTING.md` → "HA notifications not arriving for Tigo watchdog events".

If the watchdog itself looks healthy but HA's `binary_sensor.taptap_watchdog_dead` is `on`, check:

- HA's MQTT integration is connected to the same broker the watchdog publishes to.
- The retain semantics didn't break: `sensor.taptap_watchdog_last_seen` MUST extract `value_json.ts` from the payload (NOT use `last_changed` / receipt time), because the heartbeat is published with `retain=true`.
