# Finding discipline

How to decide whether something you noticed is worth reporting. A review that reports everything
it suspects is worse than no review: the mailing list reacts badly to low-signal automated
nitpicking, and a reviewer who has to dismiss ten guesses stops reading the eleventh finding.

## Provenance

The discipline below is adapted from `masoncl/review-prompts` (MIT, © 2025 Chris Mason), audited
at commit `0322843`, specifically its `false-positive-guide.md` and `slop-indicators.md`. That
project is the origin of several deployed kernel review systems, so this is field-tested practice
rather than invention.

Audit dispositions for the reviewed subset:

| Component | Disposition |
|---|---|
| `false-positive-guide.md` — evidence bar, dismissal rules | **Adopted** (principles below) |
| `slop-indicators.md` — subjective-review confidence model | **Adopted** (principles below) |
| `fixes-tag.md` — format and placement checks | **Source-only.** Its reachability step uses `merge-base --is-ancestor <sha> HEAD`, the inference `backport-review.md` deliberately rejects; adopting it would reintroduce that defect. Format checks duplicate checkpatch. |
| `callstack.md`, `debugging.md`, `coccinelle.md` | **Source-only for now** — candidates for a later, separately justified pass. |
| `slash-commands/`, `skills/kernel.md`, `subsystem/` | **Source-only.** A parallel command catalog would overlap this skill rather than extend it. |

Its installer is deliberately not run.

## The evidence bar

**If you cannot prove an issue exists with concrete evidence on at least one execution path, do
not report it.**

The corollary matters as much as the rule, because it is where the bar is misapplied in the
cautious direction: for deadlocks, infinite waits, crashes and data corruption, "concrete
evidence" means proving the path is **structurally possible**, not that it will execute on every
run. A `wait_event` with no timeout and no fallback wake condition is a deadlock bug when the wake
depends on external events that can stop. Do not dismiss that as "unlikely in practice."

## What not to report

- **Defensive checks.** Do not ask for a bounds or NULL check unless you can show the input comes
  from an untrusted source, an actual path delivers invalid data, and the current code can
  demonstrably fail. "Add a bounds check for safety" is not a finding.
- **Unhandled errors** — unless you can prove the error is reachable and that the arguments in use
  do not already preclude it.
- **Theoretical API misuse** — unless a real calling path triggers it.

## What not to accept

Assume the author's claim is unproven until code shows otherwise. A commit message that explains
why something is safe is a claim to verify, not evidence. The same goes for a comment: if you are
about to dismiss a finding *because a comment says the condition cannot happen*, verify that the
comment matches the code. Comments rot; the code is the artifact under review.

Keep the full commit message or patch description in context while doing this. Dismissals made
from a half-remembered description are how real bugs get waved through.

## Subjective observations

Style-level observations are opinions, never bugs, and they are the easiest way to make a review
useless. Hold them to a much higher bar than correctness findings.

- **Never raise a style point as part of correctness analysis.** If you are reasoning about a
  race, a lock order, a missing balance or an overflow, that is a correctness finding — it does
  not belong in a subjective pass.
- **Cluster requirement.** One weak signal is never enough. Raise something only when it is
  concrete, located, and ideally corroborated by a repeat or a second tell in the same change.
- **Compare to the neighbours, not to an ideal.** The kernel is full of long, dense code. Judge
  against the surrounding file and subsystem, and actually read that surrounding code rather than
  guessing at it. If the change matches what is already there, stay silent.
- **Plausible-reason test.** Would a competent kernel developer have a sane reason to write it
  this way? If yes, suppress.
- **Hard cap.** At most three subjective points per patch. Volume is itself the problem.

Two hard prohibitions:

- **Never assert authorship.** Do not write "this looks AI-generated," do not mention the author,
  do not name a tool. A stylistic tell is not proof a tool wrote the code, and its absence is not
  proof a human did. Talk only about the specific code or prose.
- **Never treat disclosure trailers as a finding.** `Assisted-by:` and `Co-developed-by:` are
  normalized provenance metadata. Commenting on them punishes the disclosure the process asks for.

Phrase what survives as a question about specific code — "could `x->y->z->w` be hoisted into a
local here?" — not as an instruction.
