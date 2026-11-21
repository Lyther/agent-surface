import json
import unittest

from evals.sample import parse_size, parse_stats, summarise


def row(t, load, avail, *containers):
    return {"t": t, "load": [load, 0, 0], "mem_total_kib": 1000, "mem_avail_kib": avail,
            "containers": [{"name": n, "cpu": c, "mem": m} for n, c, m in containers]}


class SampleTests(unittest.TestCase):
    def test_sizes(self):
        self.assertEqual(parse_size("12.5MiB"), 13107200)
        self.assertEqual(parse_size("2GiB"), 2 * 1024**3)
        self.assertEqual(parse_size("0B"), 0)

    def test_docker_stats_line(self):
        line = json.dumps({"Name": "a__b__env-main-1", "CPUPerc": "87.50%", "MemUsage": "1.5GiB / 2GiB"})
        self.assertEqual(parse_stats(line), {"name": "a__b__env-main-1", "cpu": 87.5, "mem": int(1.5 * 1024**3)})

    def test_summary_peaks_and_window(self):
        mib = 1024**2
        rows = [row(1, 0.5, 900, ("x__1", 50.0, 100 * mib)), row(2, 2.0, 300, ("x__1", 120.0, 400 * mib), ("x__2", 10.0, 50 * mib), ("other", 99.0, mib)),
                row(9, 7.0, 100, ("x__1", 1.0, mib))]
        out = summarise(rows, "x__", since=0, until=5)
        self.assertEqual(out["ticks"], 2)
        self.assertEqual(out["load1_peak"], 2.0)
        self.assertEqual(out["mem_avail_min_pct"], 30.0)
        self.assertEqual(out["concurrent_peak"], 2)
        self.assertEqual(set(out["containers"]), {"x__1", "x__2"})
        self.assertEqual(out["containers"]["x__1"]["cpu_peak"], 120.0)
        self.assertEqual(out["containers"]["x__1"]["mem_peak_mib"], 400.0)
        self.assertEqual(out["containers"]["x__1"]["cpu_mean"], 85.0)


if __name__ == "__main__":
    unittest.main()
