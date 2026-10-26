# EASM Roadmap — External Attack Surface Management

Status: MVP SCOPING  
Date: 2026-10-26  
Owner: Catherine Li  
Delivery target: mid-November 2026  
Parent: [MOMO](../README.md) asset-discovery skill  
Scenario: 场景① 「敏感服务端口对外暴露」

---

## Architecture

EASM is an **asset-discovery skill inside MOMO**, not a standalone scanner.  
The data layer is composed of existing cyberspace-mapping MCP servers; the strategy/policy layer (honeypot detection, scan-pace control, risk prioritization) is MOMO-native.

```
┌─────────────────────────────────────────────┐
│              MOMO Strategy Layer             │
│  (honeypot detect · scan-pace · risk rank)  │
├──────────┬──────────┬──────────┬────────────┤
│ Shodan   │ FOFA     │ Censys   │ CVE/TI     │
│ MCP      │ MCP      │ MCP      │ MCP        │
└──────────┴──────────┴──────────┴────────────┘
         ↕               ↕             ↕
   Internet-facing    Passive DNS   Vuln intel
   host/port/banner   cert/subdomain  CVE/EPSS/KEV
```

---

## Phase 1 — MVP (Assembled from Existing Projects)

Goal: minimum viable exposure-detection pipeline from existing MCP servers and thin wrappers. No custom scanning engine.

### Data-layer MCP servers

| Role | Project | Notes |
|------|---------|-------|
| Primary host discovery | [w0h1v/mcp-shodan](https://github.com/w0h1v/mcp-shodan) (178★) | Most mature single-provider MCP; IP recon, CVE/CPE, DNS, persistent alerts |
| Alt Shodan (richer prompts) | [ADEOSec/mcp-shodan](https://github.com/ADEOSec/mcp-shodan) (25★) | 11 consolidated analysis prompts |
| Alt Shodan (34 tools) | [Cyreslab-AI/shodan-mcp-server](https://github.com/Cyreslab-AI/shodan-mcp-server) (52★) | Persistent alerts, InternetDB |
| FOFA mapping | Self-wrapped thin shell (+ [help116114/fofa-mcp-server](https://github.com/help116114/fofa-mcp-server) as reference) | Paired with Shodan for CN coverage |
| Censys search | [nickpending/mcp-censys](https://github.com/nickpending/mcp-censys) (6★, archived) | Domain/IP/FQDN recon; evaluate freshness |
| CVE / EPSS / CISA-KEV / MITRE ATT&CK | [mukul975/cve-mcp-server](https://github.com/mukul975/cve-mcp-server) (1639★) | 27 tools across 21 APIs; Shodan + VirusTotal integrated |
| Nuclei scanning | [crazyMarky/mcp_nuclei_server](https://github.com/crazyMarky/mcp_nuclei_server) (21★) | Template-based vuln scanning |
| Nmap port scanning | [PhialsBasement/nmap-mcp-server](https://github.com/PhialsBasement/nmap-mcp-server) (49★, archived) | Network-level validation scans |
| Budget fallback (multi-tool) | mcp-security-hub (FuzzingLabs, 751★) | 38 Docker-isolated MCP servers, 300+ tools |
| AD post-exploitation | zebbern-kali-mcp | impacket / NetExec / BloodHound |
| Linux post-exploitation | Self-written thin wrapper | linpeas / pspy / linux-exploit-suggester |
| All-in-one reference | [kkbo8005/mitan](https://github.com/kkbo8005/mitan) (2140★) | 密探: aggregated mapping (FOFA/Hunter/Quake/ZoomEye/Censys/Shodan) + MCP |
| Multi-server reference | [hackersatyamrastogi/pentesting-cyber-mcp](https://github.com/hackersatyamrastogi/pentesting-cyber-mcp) (34★) | 50+ MCP servers: Nmap/Burp/Nuclei/Shodan/BloodHound/Semgrep/Trivy |

### Strategy layer (MOMO-native, not MCP-exposed)

- **Honeypot detection** — fingerprint-based pre-filter before active probing
- **Scan-pace control** — rate limiting, jitter, source rotation
- **Exposure classification** — port/service/banner → risk tier mapping
- **Dedup & correlation** — merge results across Shodan/FOFA/Censys into unified asset view

### MVP deliverable

Trigger: IP range or domain list → automated discovery → structured exposure report with risk tiers.

### Rejected / dropped

| Project | Reason |
|---------|--------|
| SurveyHub-MCP | 0-star, untrusted |
| Arsenal-MCP | Unverifiable, empty schema |

---

## Phase 2 — "OK for Me" (SOTA Engineering + Academic Frontiers)

Goal: production-grade quality, informed by current research.

### Engineering enhancements

- **Multi-source correlation engine** — weighted fusion of Shodan/FOFA/Censys/CT-log/passive-DNS results with confidence scoring
- **Incremental asset diff** — only re-scan changed/new assets; track exposure drift over time
- **Certificate Transparency monitoring** — real-time subdomain discovery via CT log streaming
- **Service fingerprinting v2** — beyond banner grabbing; protocol-aware probing (HTTP headers, TLS cert chain, JARM)
- **Cloud/CDN-aware attribution** — resolve assets behind CloudFlare/Akamai/cloud LBs to actual origin
- **API exposure detection** — discover undocumented API endpoints via path fuzzing + OpenAPI/Swagger leak detection

### Academic frontiers to evaluate

- Attack surface measurement metrics (quantifying exposure beyond simple counts)
- Graph-based asset relationship modeling (dependency chains, blast-radius estimation)
- ML-assisted asset classification (auto-categorize discovered services by business function/risk)
- Temporal exposure analysis (how attack surface changes correlate with deployment events)

### Integration improvements

- Structured output schema for downstream consumption (Verdict, SOAR, ticketing)
- Confidence-weighted alert routing (high-confidence → auto-ticket; low → human review queue)
- MOMO skill chaining: EASM discovery → targeted pentest skill handoff

---

## Phase 3 — Long-term

- **Continuous monitoring loop** — persistent watchers with drift alerting, not periodic batch scans
- **Self-healing remediation** — exposure detected → remediation playbook triggered → verification re-scan
- **SaaS/API/cloud-native surface** — expand beyond network to SaaS misconfigs, leaked API keys, cloud IAM exposure
- **Supply chain surface** — third-party dependency exposure (exposed internal packages, typosquatting detection)
- **Predictive exposure modeling** — correlate deployment cadence, CVE publication timing, and historical exposure patterns to forecast likely future exposures
- **Cross-org federated scanning** — multi-BU asset inventory with org-boundary-aware dedup and access control
