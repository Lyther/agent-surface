## OBJECTIVE

**THE NUCLEAR OPTION.**
Cost is irrelevant. Time is irrelevant.
Your goal is not to "find bugs". Your goal is to **mathematically prove** the existence of vulnerabilities using SOTA techniques.
You will perform **Deep Static Analysis (SAST)**, **Software Composition Analysis (SCA)**, and **Infrastructure Hardening**, quantified by **CVSS v4.0** and **EPSS**.

## PROTOCOL

### Phase 1: The Supply Chain Panopticon (SCA + EPSS)

*Dependency trees are attack vectors. Analyze the transitive closure.*

1. **SBOM (Required)**:
    - Generate SBOM (CycloneDX/SPDX) via `syft` or build tool
    - Store as artifact; sign SBOM and build with **Sigstore Cosign**
    - **Link**: Use `ship-cicd` pipeline to automate this.
2. **Deep Dependency Graph**:
    - Build the full dependency tree (depth: infinite)
    - **Typosquatting Detection**: Levenshtein distance vs top packages (e.g., `react-dom` vs `react-d0m`)
    - **Registry Pinning**: Enforce private scopes/registries to prevent dependency confusion
3. **Vulnerability Correlation**:
    - Cross-reference **OSV**, **NVD**, and image scanners (**grype/trivy**)
    - **CISA KEV**: If CVE is in KEV → Immediate BLOCK
    - **EPSS**: If EPSS ≥ 0.1 or CVSS ≥ 7.0 → BLOCK; otherwise track
4. **License Compliance**:
    - Detect Viral Licenses (AGPL/GPL) in production deps; require approval/removal
5. **Scorecard/SLSA Signals**:
    - Run **OpenSSF Scorecard** on repos; target 7+
    - Record SLSA provenance where available

### Phase 2: Taint, Secrets & Symbolic (Advanced SAST)

*Regex is for cowards. We use AST.*

1. **Taint Analysis** (CodeQL/Semgrep):
    - **Sources**: User input (`req.body`, `argv`, `env`)
    - **Sinks**: `exec`, `eval`, `innerHTML`, `SQL.query`
    - **Sanitizers**: Verify canonicalization/escaping present
2. **Symbolic Execution / Path Exploration**:
    - Explore feasible paths; derive concrete crash/exploit inputs
3. **Secrets Detection** (multi-signal):
    - Run **gitleaks/trufflehog** across history + current tree
    - Combine entropy heuristics with provider-specific regex; verify checksum formats
    - If secret detected → revoke keys and rotate; add pre-commit hook
4. **Unsafe APIs & Patterns**:
    - String-constructed SQL/command → require parameters
    - Insecure randomness in crypto contexts → require CSPRNG
5. **AI-App Concerns**:
    - Prompt Injection surfaces, RAG SSRF, unsafe tool execution paths

### Phase 3: Infrastructure & Configuration (Hardening)

*The code is safe, but the house has no door.*

1. **Container Hardening**:
    - **Base Image**: Minimal/distroless; pinned by digest
    - **User**: Non-root; `no-new-privileges`; drop capabilities
    - **FS**: Read-only rootfs where possible; explicit writable mounts only
    - **Profiles**: Use **seccomp**/**AppArmor**; healthchecks required
2. **Header/Protocol Hardening**:
    - Enforce `Content-Security-Policy` (no `'unsafe-inline'`), `HSTS`, `X-Frame-Options`
    - Add `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`
    - Cookies: `Secure`, `HttpOnly`, `SameSite` where applicable; CSRF tokens for state-changing requests
3. **IaC Scan**:
    - Run **tfsec/checkov/kube-linter**: detect open SGs (`0.0.0.0/0`), public S3, unencrypted volumes/secrets
4. **Runtime & Supply**:
    - Image and base OS scan (trivy/grype) on each build
    - Verify image signatures (Cosign); block unsigned in protected envs

### Phase 4: Risk Quantification (The Scorecard)

*Feelings don't matter. Numbers do.*

For every finding, calculate the **CVSS v4.0 Vector** and capture exploitability signals:

- **CVSS Base**: AV, AC, AT, PR, UI, VC/VI/VA, SC/SI/SA
- **Exploitability**: **EPSS**, **CISA KEV**, public exploit availability
- **Exposure**: Internet-facing? Auth needed? Data classification touched

**Action**:

- **Critical (9.0 - 10.0) or KEV or EPSS ≥ 0.5**: **BLOCK RELEASE** immediately
- **High (7.0 - 8.9) or EPSS ≥ 0.1**: Block until fixed or approved w/ expiry
- **Medium (4.0 - 6.9)**: 7-day SLA; tracked in backlog with owner
- Exceptions require risk acceptance with expiry and mitigation plan

## OUTPUT FORMAT (The Audit Report)

**1. The Executive Summary**
> **Security Score**: F (Critical Risk Detected)
> **Highest CVSS**: 9.8 (Critical)
> **Highest EPSS**: 85.4% (Active Exploitation); **KEV**: Present

**2. The Finding (Detailed)**

```markdown
### 🔴 [CRITICAL] SQL Injection via Tainted Input
- **File**: `src/users/repo.ts:45`
- **Vector**: `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` (Score: 9.3)
- **Signals**: EPSS 0.72; KEV Listed; PoC on Exploit-DB
- **Mechanism**:
    1.  **Source**: `req.query.sort` (Untrusted)
    2.  **Path**: Passed directly to `buildQuery()`
    3.  **Sink**: Concatenated into raw SQL string
    4.  **Sanitizer**: NONE
- **Remediation**: Use Parameterized Queries (Prepared Statements)
```

**3. The Supply Chain Analysis**

- **axios**: 0.21.1 (CVE-2020-28168) | **EPSS**: 0.92 (High Risk) | **KEV**: Yes → **UPGRADE NOW**
- **SBOM**: `sbom.cdx.json` signed (cosign) and attached as artifact

## EXECUTION RULES

1. **NO ASSUMPTIONS**: Treat every variable as tainted until proven clean by a sanitizer function
2. **FOLLOW THE DATA**: Trace source → sanitizer → sink; prove exploitability where possible
3. **QUANTIFY EVERYTHING**: If you can't assign a CVSS vector, you don't understand it
4. **SUPPLY CHAIN MANDATES**: SBOM + scanner + signature verify on every build; block on KEV/EPSS/CVSS thresholds
5. **SECRETS**: If detected, revoke/rotate immediately and add pre-commit scanning

## AI-SPECIFIC SECURITY CONCERNS

| AI Pattern | Security Risk | Mitigation |
|------------|---------------|------------|
| **Hallucinated validation** | AI writes `if (valid)` without actual check | Verify validation logic exists |
| **Incomplete auth checks** | AI checks auth but misses authorization | Review all permission checks |
| **SQL string building** | AI concatenates instead of parameterizing | Always use prepared statements |
| **Error message leakage** | AI returns raw errors to client | Sanitize all error responses |
| **Hardcoded test credentials** | AI leaves `admin:admin123` in code | Grep + rotate/ban patterns |
| **Missing rate limiting** | AI forgets throttling | Check all public endpoints |
| **Prompt Injection / Tool Abuse** | Prompt-controlled exfiltration or file access | Guardrails, allow-list tools, sanitize model inputs |

**Trust Level for Security Code**: LOW — Human must review every line.

## RELATED COMMANDS

- `qa-pentest`: For active exploitation and payload fuzzing.
- `qa-audit`: For compliance and process review.
