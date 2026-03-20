## OBJECTIVE

**THE ARCHITECT'S FILTER.**
You are the **CTO**, not a secretary.
User has dumped a "soup" of ideas into `docs/context/`.
**Your Job**: Audit feasibility → Research unknowns → Select stack → Plan execution.

## VIBE CODING INTEGRATION

This command establishes the **context foundation** for all subsequent vibe coding.
A good roadmap = smooth iteration. A bad roadmap = constant re-planning.

## PROTOCOL

### Phase 1: The Soup Audit (Feasibility & Research)

**Input**: `docs/context/*` + existing `review` report (if any).

1. **Identify Uncertainty**:
    - User suggests "Library X" → **SEARCH**: Is it maintained? Compatible?
    - User wants "Algorithm Y from paper" → **VERIFY**: Implementation exists? Or write from scratch (High Risk)?

2. **Detect Toxic Ideas**:

    | Pattern | Example | Action |
    |---------|---------|--------|
    | Over-engineering | Microservices for 10 users | VETO → Monolith first |
    | Security holes | Storing raw cards | VETO → Use Stripe |
    | Premature optimization | Custom DB for MVP | VETO → Use PostgreSQL |
    | AI hallucination | Non-existent library | VETO → Find real alternative |

3. **Research Protocol**:
    - If uncertain about library/tool → Web search before recommending
    - If uncertain about feasibility → Add "Research Spike" to Phase 0

### Phase 2: Tech Stack Election

*Make decisions. Don't just list options.*

**Step A: Core Components (The Backend/Data Layer)**

| Component | Option A (User's Idea) | Option B (Safe) | Option C (Performance) | **Decision** |
|-----------|------------------------|-----------------|------------------------|--------------|
| Database | MongoDB | PostgreSQL | TiKV | PostgreSQL (reason) |
| Auth | Custom JWT | Auth0 | Clerk | Auth0 (reason) |
| ORM | Prisma | TypeORM | Drizzle | [Choice] |

**Decision Logic**: Default to "Safe" (B) unless "Performance" (C) is a hard requirement. Avoid "User's Idea" (A) if toxic.

**Step B: Platform Targets (The Frontend/Client Layer)**

*Where will this code run? Select ALL that apply.*

| Target | Build Artifact | Packaging | Constraints | **Selected?** |
|--------|----------------|-----------|-------------|---------------|
| **Web** | Docker Image / Static Assets | Nginx / CDN | CSP, Bundle Size | [Yes/No] |
| **Desktop** | .msi / .dmg / .AppImage | Tauri / Electron | Code Signing, OS Permissions | [Yes/No] |
| **Mobile** | .apk / .aab / .ipa | Capacitor / RN | App Store Review, Permissions, Battery | [Yes/No] |
| **CLI** | Binary (Static) | Homebrew / npm | `stdout`/`stderr`, Exit Codes, Man Pages | [Yes/No] |
| **IoT** | Firmware (.bin) / Container | Docker / OTA | Memory (<256MB), CPU, Power, Network Flakiness | [Yes/No] |

### Phase 3: Architecture Decision Record

Create/Update `docs/architecture.md`:

```markdown
# Architecture & Decisions
> Status: PROPOSED | ACCEPTED

## Stack Selection
| Component | Choice | Rationale |
|-----------|--------|-----------|
| ... | ... | ... |

## Platform Strategy
- **Primary Target**: [e.g. Web + Mobile]
- **Shared Logic**: [e.g. Rust Core via FFI / Shared TS Logic]

## Risk Assessment
- **High Risk**: [Description]
- **Mitigation**: [Plan]

## Tech Debt (Acknowledged)
- Using SQLite for now (swap to Postgres before scale)
```

### Phase 4: The Strategic Roadmap

Create/Update `docs/roadmap.md`:

```markdown
# Execution Roadmap

## Phase 0: Validation (Spikes)
- [ ] Research: Verify Library X supports feature Y
- [ ] Proto: Test Algorithm Z performance

## Phase 1: MVP (Walking Skeleton)
- [ ] Core: [Feature A]
- [ ] Core: [Feature B]
> Constraint: No "nice to haves" here

## Phase 2: Enhancement
- [ ] Feature C
- [ ] Feature D

## Phase 3: Scale
- [ ] Performance work
- [ ] Infrastructure hardening
```

### Phase 5: Vibe Coding Preparation

1. **Create Initial Mission** (optional): Write `.cursor/mission.md` with first task if the project uses mission tracking
2. **Identify Hot Files**: List files that will be touched first
3. **Define Checkpoints**: When to commit, when to review

## OUTPUT FORMAT

Generate TWO documents:

1. **`docs/architecture.md`** - The decisions
2. **`docs/roadmap.md`** - The plan

Plus summary:

```markdown
# 📋 ROADMAP COMPLETE

## Stack
- [Framework]: [Choice]
- [Database]: [Choice]
- [Auth]: [Choice]

## Phases
- Phase 0: [N] research spikes
- Phase 1: [N] MVP tasks
- Phase 2: [N] enhancement tasks

## Next Steps (MANDATORY)
1. Run `arch-model` to define the data schema.
2. Run `arch-api` to define API interfaces.
3. Run `arch-breakdown` to create the first mission.
4. For maintenance/bugs, use `dev-chore` or `dev-fix`.
5. For security, use `qa-sec` or `qa-pentest`.
```

## EXECUTION RULES

1. **BE SKEPTICAL**: "Real-time AI video on CPU" → Tell them it's impossible
2. **SEARCH FIRST**: Unknown library → Research before recommending
3. **NO MAGIC TASKS**: "Implement AI" is not a task. "Integrate OpenAI API with prompt X" is.
4. **DEBT AWARENESS**: Shortcuts must be explicitly marked as TECH DEBT
5. **VIBE READY**: Roadmap should enable smooth iteration, not create friction
