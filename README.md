# Wavespot-Alerts

Posts to Slack when a WaveSpot device or access point goes offline and when it comes back online, without spamming the channel.

Pure Python 3.9+ standard library, no dependencies.

## How it avoids spam

| Rule | Default | Effect |
|---|---|---|
| Alert on state *changes* | — | A device that stays down sends one DOWN alert, not one per poll. |
| Down grace period | `down_after_seconds: 300`, `down_after_polls: 2` | Reboots and short blips never alert. |
| Recovery grace period | `recover_after_polls: 2` | A single "online" poll isn't enough to send RECOVERED. |
| Silent recoveries | — | If a device recovers before its DOWN alert went out, nothing is sent. |
| Reminders with backoff | `reminder_seconds: 3600` → doubles up to `max_reminder_seconds: 86400` | While a device is still down: reminders at 1h, 2h, 4h, 8h, 16h, then once a day. Set `reminder_seconds` to `0` to turn reminders off. |
| Flap detection | `flap_threshold: 4` changes in `flap_window_seconds: 3600` | A device bouncing up and down gets one FLAPPING alert, then stays muted until it has been stable for a full window. |
| One message per poll | `max_lines: 15` | All changes from a poll go out as one Slack message. A large outage is summarised per site ("50 went OFFLINE — Store 12 (30), Store 4 (20)"). |
| Fetch failures ≠ outages | — | If the WaveSpot API is unreachable, devices aren't marked offline. You get one "monitor can't reach WaveSpot" alert, which follows the same grace period and backoff. |
| Quiet first run | — | The first poll records a baseline and sends nothing, so devices that were already offline don't all alert at once. |

State is kept in `wavespot_state.json` (written atomically). If a Slack post fails, the state isn't saved, so the alert is retried on the next poll instead of being lost.

## Setup

1. **Slack:** create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) for your alerts channel.
2. **WaveSpot:** find a JSON endpoint that lists your devices and their status, then map its fields in the config (below).
3. Copy and edit the config:
   ```sh
   cp config.example.json config.json
   export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   export WAVESPOT_API_URL=https://.../devices
   export WAVESPOT_API_TOKEN=...
   ```
4. Test it without posting to Slack:
   ```sh
   python -m wavespot_alerts --config config.json --dry-run
   ```
5. Run it, either from cron:
   ```cron
   */2 * * * * cd /path/to/Wavespot-Alerts && python3 -m wavespot_alerts --config config.json >> alerts.log 2>&1
   ```
   or as a long-running process: `python -m wavespot_alerts --config config.json --loop`.

`$VARS` in `url`, `headers` and `slack_webhook_url` are expanded from the environment, so you don't have to put secrets in the config file.

### Mapping the WaveSpot response

The `source` section tells the monitor where the device list is in the JSON response and which fields to read. Use dotted paths for nested fields:

```json
"list_path": "data",
"fields": { "id": "id", "name": "name", "status": "status", "kind": "type", "site": "location.name" },
"online_values": ["online", "true", "up", "connected", "1"],
"include_kinds": ["AP"]
```

- A device counts as online when its `status` value (case-insensitive) is in `online_values`. Anything else counts as offline.
- `include_kinds` limits alerts to certain device types. Leave it empty to include all devices.
- To test without the API, save a JSON file and use `"type": "file", "path": "devices.json"`.

## Tests

```sh
python -m unittest discover -s tests -t .
```
