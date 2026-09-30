"""Core alerting logic: decides *when* to notify so Slack doesn't get spammed.

Anti-spam rules
---------------
1. Alert on state changes, not on state. A device that stays offline produces
   one DOWN alert, not one per poll.
2. Grace period before DOWN. A device must be offline for `down_after_seconds`
   AND `down_after_polls` consecutive polls before anyone hears about it, so
   reboots and brief blips never alert.
3. Grace period before RECOVERED. A device must be back online for
   `recover_after_polls` consecutive polls, so a flapping device doesn't
   produce a RECOVERED/DOWN pair every few minutes.
4. Silent recoveries. If a device comes back before its DOWN alert was sent,
   nothing is sent at all.
5. Reminders back off. While a device stays down, reminders go out after
   `reminder_seconds`, then double each time up to `max_reminder_seconds`
   (set `reminder_seconds` to 0 to disable reminders).
6. Flap detection. A device that changes state `flap_threshold` times within
   `flap_window_seconds` is marked FLAPPING: one alert, then it is muted until
   it has been stable for a full window.
7. One message per poll. All events from a poll are batched into a single
   Slack message; big outages are summarised per site instead of listing
   hundreds of devices.
8. Fetch failures are not outages. If WaveSpot can't be reached, device state
   is left untouched and a single "monitor can't reach WaveSpot" alert is sent
   (with the same backoff), instead of marking every device offline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ONLINE = "online"
OFFLINE = "offline"


@dataclass
class Settings:
    down_after_seconds: int = 300
    down_after_polls: int = 2
    recover_after_polls: int = 2
    reminder_seconds: int = 3600
    max_reminder_seconds: int = 86400
    flap_threshold: int = 4
    flap_window_seconds: int = 3600
    # Devices that disappear from the WaveSpot response are dropped from state
    # after this long, without alerting (they were probably decommissioned).
    forget_missing_after_seconds: int = 86400

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Settings":
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})


@dataclass
class Device:
    id: str
    name: str
    online: bool
    kind: str = "device"
    site: str = ""


@dataclass
class Event:
    kind: str  # "down" | "reminder" | "recovered" | "flapping" | "fetch_failed" | "fetch_recovered"
    device_id: str = ""
    name: str = ""
    device_kind: str = ""
    site: str = ""
    down_since: float | None = None
    downtime_seconds: float | None = None
    detail: str = ""


@dataclass
class Monitor:
    settings: Settings
    state: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.state.setdefault("devices", {})
        self.state.setdefault("fetch", {})

    # ------------------------------------------------------------------ fetch

    def fetch_failed(self, error: str, now: float) -> list[Event]:
        f = self.state["fetch"]
        if not f.get("failing"):
            f.update(failing=True, since=now, polls=0, alerted=False,
                     last_alert=None, alert_count=0)
        f["polls"] += 1
        f["error"] = error
        since = f["since"]
        if not f["alerted"]:
            if (now - since >= self.settings.down_after_seconds
                    and f["polls"] >= self.settings.down_after_polls):
                f.update(alerted=True, last_alert=now, alert_count=1)
                return [Event("fetch_failed", down_since=since, detail=error)]
        elif self._reminder_due(f["last_alert"], f["alert_count"], now):
            f["last_alert"] = now
            f["alert_count"] += 1
            return [Event("fetch_failed", down_since=since, detail=error,
                          downtime_seconds=now - since)]
        return []

    def _fetch_ok(self, now: float) -> list[Event]:
        f = self.state["fetch"]
        events = []
        if f.get("failing") and f.get("alerted"):
            events.append(Event("fetch_recovered",
                                downtime_seconds=now - f["since"]))
        self.state["fetch"] = {}
        return events

    # ----------------------------------------------------------------- update

    def update(self, devices: list[Device], now: float) -> list[Event]:
        events = self._fetch_ok(now)
        states = self.state["devices"]
        seen = set()
        for dev in devices:
            seen.add(dev.id)
            st = states.setdefault(dev.id, self._new_state(dev, now))
            st.update(id=dev.id, name=dev.name, kind=dev.kind, site=dev.site, last_seen=now)
            events.extend(self._step(dev, st, now))

        for dev_id in list(states):
            if dev_id not in seen:
                last = states[dev_id].get("last_seen", now)
                if now - last >= self.settings.forget_missing_after_seconds:
                    del states[dev_id]
        return events

    @staticmethod
    def _new_state(dev: Device, now: float) -> dict[str, Any]:
        return {
            "id": dev.id,
            "status": ONLINE if dev.online else OFFLINE,
            "since": now,
            "streak": 0,          # consecutive polls disagreeing with status
            "pending_since": None,  # first poll of the current streak
            "alerted": False,     # a DOWN alert is outstanding
            "last_alert": None,
            "alert_count": 0,
            "transitions": [],    # timestamps of raw online/offline flips
            "raw": dev.online,
            "flapping": False,
        }

    def _step(self, dev: Device, st: dict[str, Any], now: float) -> list[Event]:
        s = self.settings
        events: list[Event] = []

        # Flap tracking works on the raw signal, before any debouncing.
        if dev.online != st["raw"]:
            st["transitions"].append(now)
            st["raw"] = dev.online
        st["transitions"] = [t for t in st["transitions"]
                             if now - t < s.flap_window_seconds]

        if s.flap_threshold and len(st["transitions"]) >= s.flap_threshold:
            if not st["flapping"]:
                st["flapping"] = True
                events.append(self._event("flapping", st, detail=(
                    f"{len(st['transitions'])} state changes in the last "
                    f"{_fmt_duration(s.flap_window_seconds)}; muting until stable")))
            return events
        if st["flapping"]:
            if st["transitions"]:
                return events  # still inside the window, stay muted
            # Stable for a full window: resume normal tracking from here.
            st["flapping"] = False
            st.update(status=ONLINE if dev.online else OFFLINE, since=now,
                      streak=0, pending_since=None)
            if dev.online and st["alerted"]:
                st.update(alerted=False, last_alert=None, alert_count=0)
                events.append(self._event("recovered", st))
            elif not dev.online and not st["alerted"]:
                st.update(alerted=True, last_alert=now, alert_count=1)
                events.append(self._event("down", st, down_since=now))
            return events

        reported = ONLINE if dev.online else OFFLINE
        if reported == st["status"]:
            st["streak"] = 0
            st["pending_since"] = None
        else:
            st["streak"] += 1
            if st["pending_since"] is None:
                st["pending_since"] = now

        if st["status"] == ONLINE and reported == OFFLINE:
            if (st["streak"] >= s.down_after_polls
                    and now - st["pending_since"] >= s.down_after_seconds):
                st.update(status=OFFLINE, since=st["pending_since"],
                          streak=0, pending_since=None,
                          alerted=True, last_alert=now, alert_count=1)
                events.append(self._event("down", st, down_since=st["since"]))
        elif st["status"] == OFFLINE and reported == ONLINE:
            if st["streak"] >= s.recover_after_polls:
                downtime = now - st["since"]
                was_alerted = st["alerted"]
                st.update(status=ONLINE, since=now, streak=0, pending_since=None,
                          alerted=False, last_alert=None, alert_count=0)
                if was_alerted:
                    events.append(self._event("recovered", st,
                                              downtime_seconds=downtime))
        elif st["status"] == OFFLINE and st["alerted"]:
            if self._reminder_due(st["last_alert"], st["alert_count"], now):
                st["last_alert"] = now
                st["alert_count"] += 1
                events.append(self._event("reminder", st, down_since=st["since"],
                                          downtime_seconds=now - st["since"]))
        return events

    def _reminder_due(self, last_alert: float | None, count: int, now: float) -> bool:
        s = self.settings
        if not s.reminder_seconds or last_alert is None:
            return False
        interval = min(s.reminder_seconds * 2 ** max(count - 1, 0),
                       s.max_reminder_seconds)
        return now - last_alert >= interval

    @staticmethod
    def _event(kind: str, st: dict[str, Any], **kw: Any) -> Event:
        return Event(kind, device_id=st["id"],
                     name=st["name"], device_kind=st["kind"], site=st["site"], **kw)


def _fmt_duration(seconds: float) -> str:
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    minutes, _ = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    days, hours = divmod(hours, 24)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes and not days:
        parts.append(f"{minutes}m")
    return " ".join(parts) or "0m"


fmt_duration = _fmt_duration
