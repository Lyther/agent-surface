---
name: detecting-cobalt-strike-beacons
description: Detect Cobalt Strike C2 beacons in network captures by spotting jittered
  HTTP check-in intervals, named-pipe lateral movement, and known malleable C2 profile
  artifacts in PCAP and Zeek logs.
domain: cybersecurity
subdomain: threat-detection
tags:
- c2
- network
- pcap
---

# Detecting Cobalt Strike Beacons

Cobalt Strike beacons phone home to a team server on a configurable, often jittered,
interval. Look for periodic HTTP(S) check-ins with low variance, default URIs from
known malleable C2 profiles, and SMB named-pipe usage for lateral movement.

See references/iocs.md for indicators.
