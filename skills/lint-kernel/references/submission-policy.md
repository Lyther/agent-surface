# Submission policy for assisted kernel work

Upstream policy that applies when a tool helped produce a kernel patch. This governs patches sent
to kernel lists; it is unrelated to this repository's own commit conventions.

Sources: `Documentation/process/coding-assistants.rst`, `generated-content.rst`,
`threat-model.rst`, `security-bugs.rst`, `stable-kernel-rules.rst`.

## The human is the author

**An AI agent must never add `Signed-off-by:`.** Only a human can certify the Developer
Certificate of Origin. The person sending the patch is accountable for every line of it,
including the parts a tool wrote.

The assistant must never send anything itself. Prepare, report, and stop.

## AI disclosure

The disclosure is the one body line in `SKILL.md`. No `Assisted-by:`: mainline dropped it from the
docs in 1e035297ffda ("docs: remove Assisted-by references"). Later mainline commits still carry
it, so this is a convention, not an upstream ban.

## Generated content

`generated-content.rst` wants a tool that found the problem "noted in the changelog"; the
disclosure line does that. Its detail list (tools, inputs, prompts, affected portions) is optional
("You can be more transparent"); give it when a maintainer asks.

In scope, explicitly: `checkpatch.pl --fix`. Out of scope: spelling and grammar checkers,
completion, renaming, and formatters such as `clang-format`, `rust-fmt` and `Lindent`.

Maintainers may reject undisclosed generated content outright.

## State what could not be done

`coding-assistants.rst` requires saying so when the fix was not built, tested, or reproduced. One
line covers it: "Not reproduced; compile-tested only." Do not list every check that did not run.

The bug-handling procedure also expects a reproducer, a tested fix, and a `Fixes:` tag.

## Vulnerability routing

Classify before sending, and **read `threat-model.rst` itself** — do not classify from a summary.
Its exclusions turn on qualifications that a condensed list destroys: what matters is whether a
security boundary is actually crossed and whether the attack is feasible under realistic
conditions, not the surface category a finding appears to fall into.

The trap worth naming: "probabilistic" is not an exclusion. Upstream excludes attacks that need
unrealistic conditions or an implausible number of attempts — not every race or timing-dependent
bug. A production-reachable race can be a vulnerability when it violates a protection covered by
the threat model; probabilistic behavior alone does not exclude it. Reachability by itself does
not make it one either — an ordinary correctness race may cross no security boundary. Compressing
this into "lab-only or probabilistic findings are excluded" is how a real vulnerability gets
routed as an ordinary bug.

If you cannot consult the document, say the classification is unverified rather than guessing it.

- Vulnerability → `security-bugs.rst` process.
- Regular bug → `submitting-patches.rst`.

One rule with sharp edges: **if AI assistance was used to find the bug, it must be treated as
public.** The stated reason is that such findings surface simultaneously across multiple
researchers, so an embargo is not realistic. Security reports should be plain text, not Markdown,
with impact grounded in the threat model rather than speculative consequences.

## `stable@kernel.org` vs `stable@vger.kernel.org`

For fixing an **unpublished** vulnerability, use `stable@kernel.org` — the non-vger address.
Mail sent there is delivered nowhere, which reduces the chance of `git send-email` broadcasting
the fix while it is still embargoed.

**This does not make the email private.** Every other recipient on the `To:` and `Cc:` lines still
receives it in full. Swapping the address protects one channel; it does nothing about the rest of
the header, the lists, or the maintainers you also addressed. Review the whole recipient set.

For ordinary fixes, `stable@vger.kernel.org` remains correct.

## Never rewrite trailers silently

`Cc: stable`, `Fixes:`, `Signed-off-by:` and the disclosure line live inside the commit object.
Rewriting them changes every commit hash, which invalidates an already-prepared series, its mbox
identity, any dry-run output, and any recorded hashes.

Detect and **report** trailer problems. Leave the rewrite to an explicit, human-initiated re-cook
step. The same applies to recipient lists: propose, never auto-send.
