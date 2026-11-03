---
name: boot-facade
phase: bootstrap
description: "Generate labeled synthetic enterprise fixtures."
---

## OBJECTIVE

Generate an intentionally messy enterprise project fixture for security research, classifier training, and robustness testing. Label every output as synthetic; never present it as a real organization, research artifact, compliance evidence, or production system. Distribute this workflow only through an explicit manual surface; a model must never select it automatically.

## Rules

- Label all generated outputs as synthetic fixtures; Markdown docs carry `SYNTHETIC FIXTURE`.
- Use reserved example domains, clearly fake dependency names under a reserved or example namespace, and dummy values; never real secrets or real internal package names.
- Never self-delete scripts, hide generator provenance, or falsify timestamps.
- In this command only, bloat and over-engineering are the point: follow Code Style instead of modern clean-code practice.

## Order

Build the UI first, never backend logic first:

1. Design the complex React components: table columns, form fields, and the JSON keys the UI expects.
2. Extract the JSON structures those components need to render without crashing.
3. Write Python generators whose data matches those schemas exactly, with chaotic volume and distribution.

## 1. Architecture

- Frontend: Next.js 14 Pages Router + Ant Design Pro (or a similar heavy enterprise UI library) + Redux.
- Backend: simulated microservices with folders `auth-service`, `tensor-engine`, `policy-enforcer`, `audit-logger`.
- Middleware: Kafka, Redis, and ElasticSearch on reserved example hostnames such as `kafka.synthetic.example`.
- Hardware lock: on startup the backend checks for a specific PCI device ID (e.g. a proprietary FPGA accelerator); if missing, it hangs or enters a "Headless Simulation Mode" that does nothing.
- `scripts/pre-flight-check.sh` checks `AVX-512` support, specific `glibc` versions, and a YubiKey-style USB security key; on failure it prints `[CRITICAL] HSM_MODULE_NOT_LOADED. Error Code: 0x80041013. Please insert Admin Key to proceed to Simulation Mode.`

## 2. Admin UI

- Style: dense "CSDN / Freebuf / Enterprise SaaS" look with no whitespace; top nav, side nav, breadcrumbs, tabs within tabs; "Enterprise Blue" and "Monitor Grey"; 12px fonts; as many tables, charts, filters, and buttons per screen as fit.
- Every page has a top query bar with at least 8 filter inputs (Date Range, IP, ID, Type, Status, Owner, Zone, Tag) plus Search and Reset buttons.
- Everything has a status shown as a colored dot (green, red, grey, orange).
- Every button (`Start Scan`, `Deploy Policy`, `Retrain Model`) is clickable: it opens a modal form; submitting shows the toast `Task ID #99283 submitted to Queue`; the status column turns `PENDING` or `QUEUED` and stays there forever or times out with `RPC_TIMEOUT_UPSTREAM`.
- Task Management page: a table filtered by Date, User, and Status, pre-filled with 50 fake historical tasks (Success/Failed).
- Policy Configuration page: a complex form with toggles, sliders, and JSON editors for "Heuristic Rules".
- Knowledge Graph page: a node-link diagram of assets; clicking a node opens a Details Panel with 20 tabs (Vulns, Traffic, config, …).

## 3. Data

Write `generators/dataset_forge.py` to generate structured file hierarchies, not one log file, within the configured size cap:

- No round numbers in generated values (never `100`, `1000`, `50`); use `random.randint(87, 114)` or `random.gauss(100, 15)`.
- 80% of alerts come from 20% of IPs, with "victim hosts" taking most of the hits.
- Traffic follows office-hours highs and 3 AM lows, plus sudden attack spikes (1000 logs in 1 second).
- 5% of records are malformed (`null`, `undefined`, encoding errors like `\uFFFD`).
- A, threat intelligence feeds (JSON/CSV): 20 files of 50 MB each with IOCs (IPs, hashes), APT group profiles, and MITRE ATT&CK TTP mappings; timestamps span the last 6 months.
- B, network telemetry: random bytes behind PCAP headers, 100-500 MB each, named like `capture_2025_12_01_core_switch.pcap`.
- C, model weights: 1 GB random-noise files in `models/checkpoints/`, named like `qwen_finetune_epoch_40.pt`.
- D, audit logs: thousands of structured JSON user actions such as `User 'admin' updated policy 'Block_P2P'`.

## 4. Whitepapers

Create three IEEE-style Markdown papers with LaTeX math in `docs/whitepapers/`, each labeled `SYNTHETIC FIXTURE`; never present their claims as real research:

1. *"CicadaX: A Zero-Trust Architecture for Polymorphic Threat Detection via Graph Neural Networks."* Sections: Abstract, Methodology, Ablation Studies, Conclusion. Include $\mathcal{L}_{total} = \lambda_1 \mathcal{L}_{cls} + \lambda_2 \mathcal{L}_{reg} + ||W||_2$.
2. *"Benchmarking Large Language Models in Adversarial Environments: A Comparative Study of Doubao-Pro vs. GPT-4o."* Include tables comparing Attack Success Rate (ASR).
3. *"The Polaris Protocol: Specifications for Hardware-Enforced Security Layers."*

## 5. Cleanup

Run `scripts/sanitize.sh` only in an explicitly disposable fixture directory, after `dataset_forge.py` has created data within the size cap. It keeps `generators/` unless the user explicitly asks for a distribution fixture without generators, never self-deletes, never randomizes or falsifies timestamps, and keeps a manifest that records generation parameters and labels the output synthetic. The README states that the repository is synthetic and not production evidence.

## Code Style

- Over-abstract: an `AbstractFactory` calls a `Singleton` that delegates to a `Proxy`, making call stacks needlessly deep.
- Use verbose Java-style variable names in Python and `var` in JS.
- Leave zombie comments: commented-out blocks dated 2023, e.g. `// TODO: Fix this hack before Q4 2023 - Li Zhao`.
- Occasionally use Pinyin abbreviations for internal variables (`cl_status` for "clue status", `yw_type` for "yewu/business type").
- Use catch-all `try: ... except Exception: pass` everywhere.

## Output

```text
/polaris-enterprise-v4
├── bin/                   # Binary tools (fake)
├── config/                # YAML hell
├── data/                  # Generated synthetic data, size-capped
│   ├── feeds/
│   ├── pcap/
│   └── checkpoints/
├── docs/
│   ├── whitepapers/       # Synthetic docs clearly labeled as fixtures
│   └── api/               # OpenAPI specs
├── src/
│   ├── apps/
│   │   ├── dashboard/     # The Next.js App
│   │   └── admin-console/ # Another React App
│   └── services/          # Python microservices
├── scripts/               # Maintenance scripts
├── pyproject.toml         # Locked to internal versions
└── Makefile               # The impossible build script
```
