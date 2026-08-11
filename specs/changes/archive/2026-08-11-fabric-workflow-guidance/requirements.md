# Requirements: fabric workflow guidance

## R1. Minimal injection pointer

GIVEN pi-fabric is resolvable at extension registration
WHEN the Agent tool description is built (full or compact variant)
THEN it retains the existing fabric_exec routing guidance and additionally points to the fabric-workflows skill, at approximately the current text size.

GIVEN pi-fabric is not resolvable
WHEN the Agent tool description is built
THEN the description is unchanged from current behavior.

## R2. fabric-workflows skill

GIVEN the skill directory ships with pi-subagents (package.json `pi.skills`)
WHEN an agent loads SKILL.md
THEN it finds:
- a statement that pi-fabric / fabric_exec is required;
- a pattern-selection table keyed by data-dependency shape (fan-out-and-synthesize, classify-and-act, adversarial verification, generate-and-filter, tournament, loop-until-done) with one example per row and per-pattern "preserve when adapting" invariants;
- the division-of-labor rule (TypeScript owns enumeration, identity, ordering, dedup, bounds, stopping, failure ledgers; agents own semantic work);
- universal invariants: validate and bound input before fan-out, stable IDs and unique labels, preserve missing coverage, return plain structured data;
- six example programs under examples/ using the real fabric_exec API.

GIVEN any example program
WHEN it runs against a live fabric_exec runtime
THEN it completes without API-contract errors and its output distinguishes succeeded, failed, and missing work units.

## R3. Zero trigger detection

GIVEN any user message containing the word `workflow` or `workflows`
WHEN the message is submitted
THEN pi-subagents performs no keyword detection and no prompt transformation; the message reaches the model unchanged. Skill activation happens only through explicit user invocation or the harness's own skill-description matching.

## R4. Behavioral outcome (manual probe)

GIVEN pi-fabric installed and the skill shipped
WHEN the user explicitly asks for a workflow-based audit and the skill is loaded
THEN the model authors one fabric_exec program using fan-out-and-synthesize with bounded input, stable IDs, and a failure ledger, rather than issuing sequential Agent tool calls.
