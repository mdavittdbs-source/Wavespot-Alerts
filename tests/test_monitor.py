import unittest

from wavespot_alerts.monitor import Device, Monitor, Settings
from wavespot_alerts.slack import format_message
from wavespot_alerts.sources import parse_devices

POLL = 120  # seconds between polls


def dev(online, id="ap1"):
    return Device(id=id, name=id.upper(), online=online, kind="ap", site="HQ")


class MonitorTest(unittest.TestCase):
    def setUp(self):
        self.m = Monitor(Settings(down_after_seconds=300, down_after_polls=2,
                                  recover_after_polls=2, reminder_seconds=3600,
                                  max_reminder_seconds=4 * 3600,
                                  flap_threshold=4, flap_window_seconds=3600))
        self.t = 0

    def poll(self, *devices):
        self.t += POLL
        return [e.kind for e in self.m.update(list(devices), self.t)]

    def run_polls(self, n, *devices):
        out = []
        for _ in range(n):
            out += self.poll(*devices)
        return out

    def test_short_blip_never_alerts(self):
        self.poll(dev(True))
        self.assertEqual(self.run_polls(2, dev(False)), [])  # 4 minutes < 5
        self.assertEqual(self.run_polls(3, dev(True)), [])

    def test_one_down_alert_then_one_recovery(self):
        self.poll(dev(True))
        events = self.run_polls(10, dev(False))  # 20 min offline
        self.assertEqual(events, ["down"])
        self.assertEqual(self.run_polls(5, dev(True)), ["recovered"])

    def test_reminders_back_off(self):
        self.poll(dev(True))
        # 10 hours offline: down, +1h, +2h, +4h (capped at 4h), +4h
        events = self.run_polls(10 * 3600 // POLL, dev(False))
        self.assertEqual(events.count("down"), 1)
        self.assertEqual(events.count("reminder"), 3)

    def test_single_online_poll_does_not_recover(self):
        self.poll(dev(True))
        self.run_polls(5, dev(False))
        self.assertEqual(self.poll(dev(True)), [])
        self.assertEqual(self.run_polls(3, dev(False)), [])  # still alerted, no new DOWN

    def test_flapping_alerts_once_then_mutes(self):
        self.poll(dev(True))
        events = []
        for i in range(20):
            events += self.poll(dev(i % 2 == 0))
        self.assertEqual(events, ["flapping"])

    def test_fetch_failure_alerts_once(self):
        events = []
        for _ in range(10):
            self.t += POLL
            events += [e.kind for e in self.m.fetch_failed("timeout", self.t)]
        self.assertEqual(events, ["fetch_failed"])
        self.assertEqual(self.poll(dev(True)), ["fetch_recovered"])

    def test_big_outage_collapses_into_summary(self):
        devices = [dev(True, f"ap{i}") for i in range(50)]
        self.poll(*devices)
        down = [dev(False, f"ap{i}") for i in range(50)]
        events = []
        for _ in range(4):
            self.t += POLL
            events += self.m.update(down, self.t)
        self.assertEqual(len(events), 50)
        msg = format_message(events, self.t)
        self.assertEqual(len(msg.splitlines()), 2)
        self.assertIn("50 went OFFLINE", msg)


class ParseTest(unittest.TestCase):
    def test_field_mapping(self):
        payload = {"data": {"items": [
            {"mac": "aa", "label": "Lobby AP", "state": "Online", "type": "AP", "venue": {"name": "Store 1"}},
            {"mac": "bb", "label": "Gateway", "state": "offline", "type": "gateway"},
        ]}}
        cfg = {"list_path": "data.items",
               "fields": {"id": "mac", "name": "label", "status": "state",
                          "kind": "type", "site": "venue.name"}}
        a, b = parse_devices(payload, cfg)
        self.assertTrue(a.online)
        self.assertEqual(a.site, "Store 1")
        self.assertFalse(b.online)
        only_aps = parse_devices(payload, {**cfg, "include_kinds": ["ap"]})
        self.assertEqual([d.id for d in only_aps], ["aa"])


if __name__ == "__main__":
    unittest.main()
