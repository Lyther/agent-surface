# EASM Requirements — Initial Specification

Status: DRAFT  
Date: 2026-10-26  
Owner: Catherine Li  
Scenario: 场景① 「敏感服务端口对外暴露」  
Product: AI Native 暴露面管理 (parallel to SecAgent / 渗透智能体)  
Delivery: MVP ~mid-November 2026

---

## 1. Problem Statement

ByteDance operates internet-facing infrastructure across multiple business lines. Exposed service ports, stale endpoints, misconfigured services, and shadow IT assets create attack surface that is invisible without continuous external discovery. The current process is manual, periodic, and incomplete.

EASM provides **automated, continuous external attack surface discovery and risk classification** — answering: what of ours is visible from the outside, and how dangerous is that exposure?

---

## 2. Scope

### In scope

- Internet-facing host and port discovery (IPv4; IPv6 stretch)
- Service/banner fingerprinting and protocol identification
- Subdomain enumeration (DNS, CT logs, passive sources)
- Exposure risk classification (critical / high / medium / low / informational)
- Known-vulnerability correlation (CVE/EPSS/CISA-KEV matching against discovered services)
- Integration into MOMO as an asset-discovery skill
- Structured output for downstream consumers (Verdict, SOAR, ticketing)

### Out of scope (MVP)

- Internal network scanning (covered by separate SecAgent capabilities)
- Active exploitation / weaponization (MOMO pentest skills handle this post-discovery)
- Web application vulnerability scanning (separate skill domain)
- Cloud configuration auditing (separate workstream)
- Remediation automation (Phase 3)

### Boundary with adjacent systems

| System | Boundary |
|--------|----------|
| **MOMO** | EASM is a MOMO skill. MOMO orchestrates the scan, EASM provides discovery logic. MOMO's strategy layer handles honeypot detection and scan-pace control. |
| **Verdict** | Consumes EASM output for governance decisions. EASM does not make policy; Verdict does. |
| **Sentinel** | EASM feeds discovered assets into Sentinel's CoreTech-to-BU mapping. |
| **SecAgent / 渗透智能体** | Parallel product. EASM discovers; SecAgent exploits. No overlap in MVP. |

---

## 3. Functional Requirements

### FR-1: Asset Discovery

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FR-1.1 | Discover hosts and open ports for a given IP range or CIDR | P0 | MVP |
| FR-1.2 | Discover hosts and open ports for a given domain (resolve + scan) | P0 | MVP |
| FR-1.3 | Enumerate subdomains via passive sources (DNS, CT logs, search engines) | P0 | MVP |
| FR-1.4 | Identify services behind discovered ports (banner grab, protocol detection) | P0 | MVP |
| FR-1.5 | Correlate results across multiple data sources into a unified asset record | P1 | MVP |
| FR-1.6 | Detect newly appeared or disappeared assets between scan cycles | P1 | Phase 2 |
| FR-1.7 | Resolve assets behind CDN/cloud load balancers to actual origins | P2 | Phase 2 |

### FR-2: Risk Classification

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FR-2.1 | Map discovered services to known CVEs (NVD, CISA KEV) | P0 | MVP |
| FR-2.2 | Score exposure risk using EPSS probability and CVSS | P0 | MVP |
| FR-2.3 | Classify exposure into tiers: critical / high / medium / low / info | P0 | MVP |
| FR-2.4 | Flag high-risk patterns: default credentials, admin panels, debug endpoints, unpatched known-exploited vulns | P1 | MVP |
| FR-2.5 | Confidence scoring on each finding (data source reliability × evidence strength) | P1 | Phase 2 |

### FR-3: Scan Orchestration (MOMO Strategy Layer)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FR-3.1 | Pre-scan honeypot detection to avoid alerting defenders | P0 | MVP |
| FR-3.2 | Configurable scan-pace control (rate limits, jitter, source rotation) | P0 | MVP |
| FR-3.3 | Multi-source query orchestration (fan out to Shodan + FOFA + Censys, merge results) | P0 | MVP |
| FR-3.4 | Retry and fallback logic when a data source is unavailable or rate-limited | P1 | MVP |
| FR-3.5 | Scan session state persistence (resume interrupted scans) | P2 | Phase 2 |

### FR-4: Output & Integration

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| FR-4.1 | Structured JSON output per scan session (asset inventory + findings) | P0 | MVP |
| FR-4.2 | Summary report suitable for human review (grouped by risk tier) | P0 | MVP |
| FR-4.3 | Machine-readable output consumable by Verdict's decision engine | P1 | MVP |
| FR-4.4 | Exposure diff report (what changed since last scan) | P1 | Phase 2 |
| FR-4.5 | Direct integration with ticketing / SOAR for auto-triage | P2 | Phase 2 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Scan completion time for a /16 CIDR | < 30 min (passive) / < 4h (active validation) |
| NFR-2 | False positive rate on critical/high findings | < 10% (MVP); < 5% (Phase 2) |
| NFR-3 | Data source availability | Graceful degradation: any single source down → others compensate, finding confidence adjusted |
| NFR-4 | API key management | All third-party API keys stored in MOMO's credential vault, never in scan configuration |
| NFR-5 | Scan footprint | Must not trigger IDS/WAF alerts on target infrastructure during routine scans |
| NFR-6 | Concurrency | Support parallel scans across multiple target scopes without cross-contamination |
| NFR-7 | Auditability | Every scan action logged with timestamp, source, target, and result for compliance review |

---

## 5. Architecture Constraints

1. **No custom scanning engine.** EASM uses existing MCP servers (Shodan, FOFA, Censys, Nuclei, Nmap) as the data layer. Custom code is limited to the strategy/policy layer and the MCP-to-MOMO integration glue.

2. **MCP-native interface.** All data-source interactions go through MCP tool calls. This keeps the data layer swappable — a new source means a new MCP server, not a code change in EASM.

3. **MOMO skill contract.** EASM implements the MOMO skill interface: it receives a target specification, returns structured findings, and exposes its capabilities for MOMO's planner to reason about.

4. **Honeypot detection and scan-pace control stay in MOMO.** These are cross-cutting concerns that apply to all offensive skills, not EASM-specific. They are not exposed as MCP tools.

5. **Stateless per-scan.** Each scan is a self-contained job. Scan-to-scan state (drift detection, history) is a Phase 2 concern and lives in MOMO's persistence layer, not in EASM.

---

## 6. Data Source Dependencies

| Source | API | Key Required | Rate Limits | Coverage |
|--------|-----|-------------|-------------|----------|
| Shodan | REST + Streaming | Yes (paid plan recommended) | 1 req/s (free); higher on paid | Global IPv4, banners, CVE |
| FOFA | REST | Yes | Tier-dependent | Strong CN coverage |
| Censys | REST v2 | Yes (free tier exists) | 60 req/min (free) | IPv4, certificates, protocols |
| NVD | REST 2.0 | Optional (higher rate with key) | 5 req/30s (no key); 50 req/30s (with key) | CVE database |
| CISA KEV | JSON feed | No | Unlimited (static file) | Known exploited vulns |
| EPSS | CSV/API | No | Unlimited | Exploit probability scores |
| CT Logs | Various (crt.sh, Certstream) | No | Varies | Certificate transparency |
| VirusTotal | REST v3 | Yes | 4 req/min (free); 500 req/min (premium) | Malware, DNS, domain intel |

---

## 7. Acceptance Criteria (MVP)

| # | Criterion |
|---|-----------|
| AC-1 | Given a domain, EASM discovers all subdomains resolvable via passive sources and returns them with IP mappings |
| AC-2 | Given an IP range, EASM returns all hosts with open ports and service banners |
| AC-3 | Discovered services are matched against NVD/KEV and findings are classified into risk tiers |
| AC-4 | Honeypot detection flags known honeypot signatures before active probing begins |
| AC-5 | Scan respects configured rate limits and does not exceed them even under parallel execution |
| AC-6 | Output JSON is valid against the defined schema and consumable by a downstream Verdict stub |
| AC-7 | A single data source outage does not crash the scan; results from remaining sources are returned with adjusted confidence |
| AC-8 | End-to-end scan of a test /24 completes within 10 minutes (passive + active validation) |

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shodan/FOFA API cost overrun on large scopes | Budget blowout | Implement query budgeting in strategy layer; prefer passive/cached results; fall back to InternetDB for bulk lookups |
| Third-party MCP server quality varies | False negatives, instability | Pin to tested versions; mcp-security-hub as fallback; integration tests per source |
| Rate limiting causes incomplete scans | Missing assets | Retry with backoff; spread queries across time; track coverage percentage per scan |
| Honeypot evasion is imperfect | Trigger target-side alerts | Conservative default posture; configurable aggression levels; passive-first approach |
| Scope creep into active exploitation | Blur boundary with SecAgent | Hard contract: EASM discovers and classifies, never exploits. MOMO skill handoff is the boundary |
| MVP delivery timeline (~3 weeks) is tight | Incomplete coverage | Prioritize Shodan + FOFA core path; defer Censys/CT-log to post-MVP if needed |

---

## 9. Open Questions

1. **Budget model**: per-scan API cost tracking — needed for MVP, or Phase 2?
2. **Multi-tenant isolation**: do different BU scans need separate credential sets and result partitioning?
3. **Nuclei template selection**: full template set vs. curated high-confidence subset for MVP?
4. **IPv6**: any immediate requirement, or defer entirely to Phase 2?
5. **Scan scheduling**: MOMO handles this, or does EASM need its own cron-like trigger?
