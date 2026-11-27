# Testing Requirements

## Actually Useful Tests

Coverage is a floor, not the goal: each test must fail when the behavior it covers breaks.

Test Tiers:

1. **Unit Tests** — Individual functions, utilities, components
2. **Integration Tests** — API endpoints, database operations, service boundaries
3. **E2E Tests** — Critical user flows

Claim done only if relevant checks ran and passed after your last edit.

Claim E2E, release-ready, or production-ready only after a real run through the real entry point and real dependencies.

Prefer real implementations and disposable real dependencies. Never mock the unit under test, and never claim integration or E2E proof from a test substitute (mock, fake, stub, or in-memory stand-in). Use a narrow boundary substitute only when the real dependency is destructive, charged, or cannot deterministically produce the tested state, and state clearly what real boundary remains unverified.

## Troubleshooting Test Failures

1. Check test isolation and environment state.
2. Verify test fixtures and any boundary substitutes match real dependency contracts.
3. Fix root causes in code; never weaken, skip, or game assertions to pass.

## Patching Review Findings

1. Evaluate the real impact and trade-off of patching.
2. Push back with evidence if a finding:
   - Has zero or negligible real-world impact
   - Cannot be triggered across any reachable execution path
   - Demands speculative hardening whose complexity outweighs the risk
3. Investigate and trace root causes before patching.
4. Apply the minimal cohesive fix, and check sibling code for the same bug pattern.
