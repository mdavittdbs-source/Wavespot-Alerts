"""CLI entry point.

    python -m wavespot_alerts --config config.json          # one poll (cron)
    python -m wavespot_alerts --config config.json --loop   # poll forever
    python -m wavespot_alerts --config config.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
import time

from .monitor import Monitor, Settings
from .slack import format_message, post
from .sources import fetch_devices

log = logging.getLogger("wavespot_alerts")


def load_state(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_state(path: str, state: dict) -> None:
    # Atomic write so a crash mid-save can't corrupt state and re-trigger alerts.
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".state-")
    with os.fdopen(fd, "w") as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, path)


def poll_once(cfg: dict, dry_run: bool = False) -> None:
    state_path = cfg.get("state_file", "wavespot_state.json")
    first_run = not os.path.exists(state_path)
    monitor = Monitor(Settings.from_dict(cfg.get("alerting", {})), load_state(state_path))
    now = time.time()

    try:
        devices = fetch_devices(cfg["source"])
    except Exception as exc:  # network, auth, bad JSON, ...
        log.warning("fetch failed: %s", exc)
        events = monitor.fetch_failed(f"{type(exc).__name__}: {exc}", now)
    else:
        log.info("fetched %d devices", len(devices))
        events = monitor.update(devices, now)
        if first_run:
            # Seed state silently; devices already offline at first start
            # shouldn't all page at once.
            offline = sum(not d.online for d in devices)
            log.info("first run: recorded baseline (%d offline), no alerts sent", offline)
            events = []

    if events:
        text = format_message(events, now, cfg.get("max_lines", 15))
        webhook = os.path.expandvars(cfg.get("slack_webhook_url", "$SLACK_WEBHOOK_URL"))
        if dry_run or not webhook or webhook.startswith("$"):
            print(text)
        else:
            try:
                post(webhook, text)
            except Exception as exc:
                # Don't save state: the same events will be regenerated and
                # retried next poll rather than silently lost.
                log.error("slack post failed, will retry next poll: %s", exc)
                return
    save_state(state_path, monitor.state)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="wavespot_alerts")
    p.add_argument("--config", default="config.json")
    p.add_argument("--loop", action="store_true", help="poll forever")
    p.add_argument("--dry-run", action="store_true", help="print instead of posting")
    args = p.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with open(args.config) as f:
        cfg = json.load(f)

    if not args.loop:
        poll_once(cfg, args.dry_run)
        return 0
    interval = cfg.get("poll_interval_seconds", 120)
    while True:
        try:
            poll_once(cfg, args.dry_run)
        except Exception:
            log.exception("poll crashed")
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
