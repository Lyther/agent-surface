# Testing Requirements

## Actually Useful Tests

Coverage is a floor, not the goal: each test must fail when the behavior it covers breaks.

Test Types:

1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows

Claim done only if the relevant tests passed after your last edit.

Claim E2E, release-ready or production-ready only after a real run through the real entry point and real dependencies.

No mocks, fakes or stubs unless the user explicitly approves them.

## Troubleshooting Test Failures

1. Check test isolation
2. Verify mocks are correct
3. Do real fixes; no test-gaming

## Patching Review Findings

1. Evaluate the trade-off of patching
2. Push back if:
   - Causes no (or very low) impact
   - Impossible to trigger
   - It's unnecessary hardening, defense in depth, over-concern, or not even a security finding
3. Investigate and find real causes before patching
4. Do the minimal patch
5. Look for the same pattern in sibling code
