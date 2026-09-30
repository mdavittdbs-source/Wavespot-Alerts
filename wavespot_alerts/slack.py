"""Turn a poll's events into one Slack message."""

from __future__ import annotations

import json
import time
import urllib.request
from collections import defaultdict

from .monitor import Event, fmt_duration

EMOJI = {
    "down": ":red_circle:",
    "reminder": ":warning:",
    "recovered": ":large_green_circle:",
    "flapping": ":arrows_counterclockwise:",
    "fetch_failed": ":rotating_light:",
    "fetch_recovered": ":white_check_mark:",
}


def _label(e: Event) -> str:
    where = f" @ {e.site}" if e.site else ""
    return f"*{e.name}* ({e.device_kind}{where})"


def _line(e: Event, now: float) -> str:
    icon = EMOJI[e.kind]
    if e.kind == "down":
        return f"{icon} {_label(e)} is OFFLINE (since {_clock(e.down_since)})"
    if e.kind == "reminder":
        return f"{icon} {_label(e)} still OFFLINE for {fmt_duration(e.downtime_seconds)}"
    if e.kind == "recovered":
        d = f" after {fmt_duration(e.downtime_seconds)}" if e.downtime_seconds else ""
        return f"{icon} {_label(e)} is back ONLINE{d}"
    if e.kind == "flapping":
        return f"{icon} {_label(e)} is FLAPPING: {e.detail}"
    if e.kind == "fetch_failed":
        d = f" for {fmt_duration(e.downtime_seconds)}" if e.downtime_seconds else ""
        return f"{icon} Monitor can't reach WaveSpot{d}: `{e.detail[:200]}`"
    if e.kind == "fetch_recovered":
        return f"{icon} Monitor reconnected to WaveSpot after {fmt_duration(e.downtime_seconds)}"
    return f"{e.kind}: {e.name}"


def _clock(ts: float | None) -> str:
    return time.strftime("%Y-%m-%d %H:%M %Z", time.localtime(ts)) if ts else "?"


def format_message(events: list[Event], now: float, max_lines: int = 15) -> str:
    """One message per poll; collapse per site when there are too many lines."""
    if len(events) <= max_lines:
        return "\n".join(_line(e, now) for e in events)

    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    other = []
    for e in events:
        if e.device_id:
            counts[e.kind][e.site or "(no site)"] += 1
        else:
            other.append(_line(e, now))

    titles = {"down": "went OFFLINE", "reminder": "still OFFLINE",
              "recovered": "came back ONLINE", "flapping": "are FLAPPING"}
    out = [f"*WaveSpot: {len(events)} device changes*"] + other
    for kind in ("down", "reminder", "flapping", "recovered"):
        if kind not in counts:
            continue
        total = sum(counts[kind].values())
        sites = ", ".join(f"{site} ({n})" for site, n in
                          sorted(counts[kind].items(), key=lambda x: -x[1])[:10])
        out.append(f"{EMOJI[kind]} {total} {titles[kind]} — {sites}")
    return "\n".join(out)


def post(webhook_url: str, text: str) -> None:
    body = json.dumps({"text": text}).encode()
    req = urllib.request.Request(webhook_url, data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read()
