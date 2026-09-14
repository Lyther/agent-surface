# ops-swarm report template

Companion reference for `ops-swarm`. The required sections and their order; the rules about what
must appear in them — dissent preserved, evidence separated from corroboration — are in `SKILL.md`.

Return a Markdown report unless `--state` only is requested:

```markdown
# Swarm Report

## Executive Decision
- Status:
- Answer:
- Recommended next action:
- Confidence:
- Verification:

## Issue Contract

## Swarm Plan
- Topology:
- Agents:
- Packets:
- Budget:

## Evidence Ledger
| ID | Source | Summary |

## Findings
| Finding | Evidence | Confidence | Limits |

## Conflicts and Dissent
| Conflict | Resolution | Remaining Risk |

## Verification
| Check | Result | Evidence |

## Next Actions
```

If `--write` is provided, write the report to the requested path and also return the key decision in chat.
