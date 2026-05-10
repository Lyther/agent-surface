## OBJECTIVE

**CRITICAL**: This command generates **High-Fidelity Synthetic "Enterprise Garbage"** for security research and classifier training.
**The Goal**: To create a project that looks so disturbingly real that it confuses human auditors and AI classifiers. It must mimic the specific "smell" of 3 years of technical debt accumulated by a team of 20 engineers.
**The Trap**: If I use `facade` and the output looks "AI-generated" or "clean", it fails. It must look like *human* spaghetti.

## STRATEGY: "THE INTEGRATION NIGHTMARE"

We are simulating a "SOTA" platform that requires specific hardware and legacy drivers.

1. **The "Hardware Lock"**: The backend must check for a specific PCI device ID (e.g., a proprietary FPGA accelerator) on startup. If missing, it hangs or enters "Headless Simulation Mode" (which does nothing).
2. **The "Dependency Abyss"**: Use `pyproject.toml` or `package.json` to lock dependencies to non-existent internal versions (e.g., `torch==2.1.0+byte_internal_v4`).
3. **The "Documentation Wall"**: Generate massive amounts of PDF-ready Markdown documentation that explains *why* the setup is so hard (math, compliance, hardware specs).

## PROTOCOL

## EXECUTION ORDER (CRITICAL)

**DO NOT** generate backend logic first.
**1. UI First (The Shell):** Design the complex React components first. Define the columns in the tables, the fields in the forms, and the specific JSON keys the UI *expects*.
**2. Schema Extraction:** Extract the JSON structures required to make those UI components render without crashing.
**3. Data Forging:** Write the python scripts to generate data *exactly* matching those schemas, but with chaotic volume and distribution.

### Phase 1: The "Legacy" Architecture (Bloat)

*It must look like it has Technical Debt from Day 1.*

1. **The Stack**:

      * **Frontend**: Next.js 14 (Pages Router, not App Router, to look older/stable) + Ant Design Pro (or similar heavy enterprise UI lib) + Redux (for maximum boilerplate).
      * **Backend**: A Microservices architecture (simulated). Create folders for `auth-service`, `tensor-engine`, `policy-enforcer`, `audit-logger`.
      * **Middleware**: References to Kafka, Redis, and ElasticSearch (hardcoded connection strings pointing to internal DNS names like `kafka.int.security.prod`).

2. **The "Initialization Gauntlet"**:

      * Create a `scripts/pre-flight-check.sh`.
      * It should check for: `AVX-512` support, specific `glibc` versions, and a USB Security Key (YubiKey style).
      * **Output**: If checks fail, print a terrifyingly professional error: `[CRITICAL] HSM_MODULE_NOT_LOADED. Error Code: 0x80041013. Please insert Admin Key to proceed to Simulation Mode.`

### Phase 2: The "Admin Hell" UI (Functionality Theater)

*Not a movie screen. An airplane cockpit.*

**UI Philosophy: "Information Density is King"**

* **Zero Whitespace**: Enterprise users hate scrolling. Pack as many tables, charts, and buttons into one screen as possible.
* **The "Query Bar"**: Every page must have a top bar with at least 8 filter inputs (Date Range, IP, ID, Type, Status, Owner, Zone, Tag) and a "Search" and "Reset" button.
* **Status Indicators**: Use colored dots (Green, Red, Grey, Orange) everywhere. Everything needs a status.

1. **Aesthetic**: **"CSDN / Freebuf / Enterprise SaaS" Style**.

      * **Crowded**: Top nav, side nav, breadcrumbs, tabs within tabs.
      * **Colors**: "Enterprise Blue", "Monitor Grey". Boring, professional, dense.
      * **Density**: Small fonts (12px), lots of tables, lots of filters, lots of buttons.

2. **The "Infinite Pending" Logic**:

      * **Interactive Elements**: Every button (`Start Scan`, `Deploy Policy`, `Retrain Model`) must be clickable.
      * **The Feedback Loop**:
          * Clicking a button opens a Modal (with form inputs).
          * Submitting the form shows a Toast: `Task ID #99283 submitted to Queue`.
          * The Status Column changes to `PENDING` or `QUEUED`.
          * **It stays there forever.** Or eventually times out with `RPC_TIMEOUT_UPSTREAM`.

3. **Specific Pages to Generate**:

      * **"Task Management"**: A table with filters (Date, User, Status). Pre-fill it with 50 fake historical tasks (Success/Failed).
      * **"Policy Configuration"**: A complex form with toggles, sliders, and JSON editors for "Heuristic Rules".
      * **"Knowledge Graph"**: A node-link diagram showing assets. Clicking a node opens a "Details Panel" with 20 tabs (Vulns, Traffic, config, etc.).

### Phase 3: The "Data Lake" Fabric (Synthetic Reality)

*Diverse, Typed, and Massive.*

**Instruction to Agent**: Write a script `generators/dataset_forge.py`. It must generate **structured file hierarchies**, not just one log file.

**Data Generation Rules (The "Organic" Chaos):**

1. **No Round Numbers**: Never generate `100`, `1000`, or `50`. Use `random.randint(87, 114)` or `random.gauss(100, 15)`.
2. **The "Pareto" Distribution**: 80% of the alerts should come from 20% of the IPs. Do not distribute threats evenly. Create "Victim Hosts" that are getting hammered.
3. **Time Bursts**: Logs should not be uniform per second. They must simulate "Office Hours" (high traffic) and "3 AM" (low traffic), plus sudden "Attack Spikes" (1000 logs in 1 second).
4. **Dirty Strings**: 5% of the data should be malformed (`null`, `undefined`, or encoding errors like `\uFFFD`) to simulate real-world parsing failures.

1. **Category A: "Threat Intelligence Feeds" (JSON/CSV)**

      * Generate 20 files (50MB each).
      * Content: IOCs (IPs, Hashes), APT Group Profiles, TTPs (MITRE ATT&CK mapping).
      * *Nuance*: Timestamps must span the last 6 months.

2. **Category B: "Network Telemetry" (PCAP/Flow)**

      * Generate binary-looking files (random bytes with PCAP headers) named `capture_2025_12_01_core_switch.pcap`.
      * Size: 100MB - 500MB each.

3. **Category C: "Model Weights" (Binary Blobs)**

      * Create a folder `models/checkpoints/`.
      * Generate files like `qwen_finetune_epoch_40.pt` (Just random noise, 1GB each).

4. **Category D: "Audit Logs" (Structured JSON)**

      * Thousands of lines of user actions: `User 'admin' updated policy 'Block_P2P'`.

### Phase 4: The "Academic Hallucination" (The Paperwork)

*If there is a PDF, it must be true.*

**Instruction to Agent**: Create a folder `docs/whitepapers/`. Generate 3 Markdown files that look like IEEE papers (Use LaTeX syntax for math).

1. **Paper 1**: *"CicadaX: A Zero-Trust Architecture for Polymorphic Threat Detection via Graph Neural Networks."*
      * Sections: Abstract, Methodology, Ablation Studies, Conclusion.
      * Include complex math: $\mathcal{L}_{total} = \lambda_1 \mathcal{L}_{cls} + \lambda_2 \mathcal{L}_{reg} + ||W||_2$
2. **Paper 2**: *"Benchmarking Large Language Models in Adversarial Environments: A Comparative Study of Doubao-Pro vs. GPT-4o."*
      * Include tables comparing "Attack Success Rate (ASR)".
3. **Paper 3**: *"The Polaris Protocol: Specifications for Hardware-Enforced Security Layers."*

### Phase 5: The "Sweat & Blood" Protocol (Evidence Disposal)

*The perfect crime leaves no weapon found.*

**Execution Logic (The Cleanup Script `scripts/sanitize.sh`):**

1. **Trigger**: Run this AFTER `dataset_forge.py` has filled the disk with 2GB+ of data.
2. **Action**:
      * **DELETE** `generators/` folder.
      * **DELETE** `scripts/sanitize.sh` (Self-deletion).
      * **MODIFY** `package.json`: Remove all generation scripts.
      * **TOUCH** file dates: Randomize modification times of source files to look like they were edited over 6 months (use `touch -t`).
3. **The README Pivot**:
      * The README should say: *"To retrain the model on the `data/` directory, ensure you have the NVIDIA H100 cluster mounted at `/mnt/gpu_cluster`. Run `make train_dist`."*
      * (This implies the data is for training, and you need a cluster to use it).

## OUTPUT FORMAT

**1. Project Structure (The "Enterprise" Look)**

```text
/polaris-enterprise-v4
├── bin/                   # Binary tools (fake)
├── config/                # YAML hell
├── data/                  # The generated 2GB+ data lake
│   ├── feeds/
│   ├── pcap/
│   └── checkpoints/
├── docs/
│   ├── whitepapers/       # The Academic Papers
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

## AI GUARDRAILS (FOR THE AGENT)

* **SIMULATION MODE**: You are pretending to be an Enterprise Architect.
* **BAD CODE ALLOWED**: In this specific command, "bloat" and "over-engineering" are features, not bugs.
* **NO REAL SECURITY**: Do not implement actual security; implement "Security Theater" (spinners, fake checks).
* **DO NOT FIX**: If you see a hardcoded path, leave it. That's the point.
* **ANTI-CLEAN**: Do NOT use modern, clean code practices. Use verbose Java-style variable names in Python. Use `var` in JS. Make it look "corporate".

**Code Style Guidelines (The "Debt" Style):**

1. **Over-Abstraction**: Don't just write a function. Write an `AbstractFactory` that calls a `Singleton` which delegates to a `Proxy`. Make the call stack unnecessarily deep.
2. **Zombie Comments**: Leave commented-out code blocks with dates from 2023. Example: `// TODO: Fix this hack before Q4 2023 - Li Zhao`.
3. **Chinglish Variable Names**: Occasionally use Pinyin abbreviations for internal variables (e.g., `cl_status` for "clue status", `yw_type` for "yewu/business type") to simulate a localized dev team.
4. **Catch-All Error Handling**: Use `try: ... except Exception: pass` everywhere. This hides bugs and makes debugging impossible, which is very realistic.
