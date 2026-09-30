"""Where device status comes from.

WaveSpot doesn't publish a documented device-status API, so the HTTP source is
driven entirely by config: point it at whatever JSON endpoint your WaveSpot
dashboard/API returns device lists from, and map the fields.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import Any

from .monitor import Device


def _get_path(obj: Any, path: str) -> Any:
    """Look up a dotted path like 'data.devices' or 'status.online'."""
    if not path:
        return obj
    for part in path.split("."):
        if isinstance(obj, dict):
            obj = obj.get(part)
        elif isinstance(obj, list) and part.isdigit():
            obj = obj[int(part)]
        else:
            return None
    return obj


def _expand_env(value: str) -> str:
    return os.path.expandvars(value) if isinstance(value, str) else value


def parse_devices(payload: Any, cfg: dict[str, Any]) -> list[Device]:
    fields = cfg.get("fields", {})
    items = _get_path(payload, cfg.get("list_path", ""))
    if not isinstance(items, list):
        raise ValueError(
            f"expected a list at list_path={cfg.get('list_path')!r}, "
            f"got {type(items).__name__}")

    online_values = {str(v).lower() for v in cfg.get("online_values", ["online", "true", "up", "1"])}
    kinds_filter = {k.lower() for k in cfg.get("include_kinds", [])}

    devices = []
    for item in items:
        dev_id = _get_path(item, fields.get("id", "id"))
        if dev_id is None:
            continue
        raw_status = _get_path(item, fields.get("status", "status"))
        kind = str(_get_path(item, fields.get("kind", "type")) or "device")
        if kinds_filter and kind.lower() not in kinds_filter:
            continue
        devices.append(Device(
            id=str(dev_id),
            name=str(_get_path(item, fields.get("name", "name")) or dev_id),
            online=str(raw_status).lower() in online_values,
            kind=kind,
            site=str(_get_path(item, fields.get("site", "site")) or ""),
        ))
    return devices


def fetch_devices(cfg: dict[str, Any]) -> list[Device]:
    kind = cfg.get("type", "http")
    if kind == "file":
        with open(cfg["path"]) as f:
            return parse_devices(json.load(f), cfg)
    if kind != "http":
        raise ValueError(f"unknown source type {kind!r}")

    headers = {"Accept": "application/json"}
    headers.update({k: _expand_env(v) for k, v in cfg.get("headers", {}).items()})
    req = urllib.request.Request(_expand_env(cfg["url"]), headers=headers)
    with urllib.request.urlopen(req, timeout=cfg.get("timeout", 30)) as resp:
        payload = json.load(resp)
    return parse_devices(payload, cfg)
