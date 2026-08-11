# Fabric workflow guidance

Guide the main agent to author elaborate, well-structured multi-agent orchestration programs in `fabric_exec` when the task fits, replicating the guidance architecture of pi-dynamic-workflows without replicating its runtime. Assumes pi-fabric is installed; the injection surface gates on the existing `detectPiFabric()` check.

Reference basis: analysis of https://github.com/QuintinShaw/pi-dynamic-workflows (cloned at /tmp/pdw during shaping). Its elaborateness comes from a layered guidance stack, not runtime features:

1. One compact always-on authorization gate that names fitting task shapes and requires explicit user opt-in.
2. Syntax taught at authoring time, not in the permanent prompt.
3. On-demand skill with a pattern library keyed by data-dependency shape, each pattern with an adaptable example and "preserve when adapting" invariants.
4. A division-of-labor rule: code owns enumeration, identity, ordering, dedup, bounds, stopping, and failure ledgers; agents own semantic work.
5. Failure-ledger discipline: preserve work-unit IDs even for null results; synthesis receives full coverage ledger.

## Problem

pi-fabric already provides the runtime (agent calls from TypeScript, parallel fan-out, worktree isolation, budgets), but the current pi-subagents compatibility injection is one vague line naming no workflow shapes and giving no authoring vocabulary. The main agent defaults to sequential explore-code-review loops and rarely authors real orchestration programs.

## Desired outcome

When the user invokes the fabric-workflows skill (explicitly, or the harness matches its description) and the task has a decomposable dependency structure, the main agent authors a single `fabric_exec` orchestration program using the appropriate pattern (fan-out-and-synthesize, classify-and-act, adversarial verification, generate-and-filter, tournament, loop-until-done) with stable IDs, bounded fan-out, and failure ledgers, instead of improvised sequential `Agent` calls.

## Scope

Two surfaces, both in pi-subagents:

1. **Skill** `skills/fabric-workflows/`: SKILL.md plus a pattern-selection reference and six adaptable example programs written against the real fabric_exec API (verified against pi-fabric's fabric-exec skill and source, not against pi-dynamic-workflows' API). Shipped via package.json `pi.skills`; the skill's `<available_skills>` description entry is the primary discovery surface.
2. **Minimal injection edit** in `src/index.ts` (both full and compact pi-fabric description variants): keep current size and intent, add a pointer to the fabric-workflows skill. Gated on existing `detectPiFabric()`.

**Explicitly no trigger-word detection.** An earlier draft included a bounded-word `workflow` trigger that injected a per-turn arming banner via a `pi.on("input")` transform. Decision: drop it entirely to avoid false-arming and prompt-transform complexity. Discovery relies on the skill listing and explicit user invocation only.

## Non-goals

- No keyword/trigger detection, no input transforms, no new commands.
- No runtime replication: no journaled resume, progress panel, saved workflows, model tiers, or quality-helper runtime functions. Quality patterns (verify, judge panel, loop-until-dry) appear only as prompt patterns inside skill examples.
- No changes to pi-fabric itself.
- No forced workflow execution; guidance authorizes, never requires.

## Risks

- **API fidelity**: examples must match the actual fabric_exec workflow/agents contract. Mitigation: read pi-fabric's fabric-exec skill and source before writing examples; run at least one example end to end.
- **Discovery**: without a trigger, uptake depends on the skill description matching workflow-shaped requests and on the injection pointer. Accepted trade-off.
- **Skill visibility without pi-fabric**: the skill lists unconditionally once packaged. Acceptable; SKILL.md states the pi-fabric prerequisite in its first line.

## Acceptance criteria

1. With pi-fabric installed, the Agent tool description (full and compact) points to the fabric-workflows skill; without pi-fabric, descriptions are unchanged from current behavior.
2. The skill ships six example programs, each executing successfully against a live fabric_exec runtime (or verified against its documented contract where live execution is impractical), each preserving work-unit IDs and a failure ledger.
3. The skill is discoverable in `<available_skills>` after install (package.json `pi.skills` set, SKILL.md frontmatter valid).
4. Behavioral probe: with the skill loaded, prompt "audit every route under src/routes/ for missing auth checks using a workflow" leads the model to author one fabric_exec program with fan-out and synthesis rather than sequential Agent tool calls (manual verification).
