# Design: fabric workflow guidance

Verified facts from recon (2026-08-11):

- `detectPiFabric()` at `src/index.ts:752-762` (import.meta.resolve plus node_modules fallback).
- Injection points: `src/index.ts:837` (full description) and `:865` (compact), both `desc +=` string appends inside the description builders.
- Skills ship via package.json `"pi": {"skills": [...]}` (verified in pi-fabric and pi-dynamic-workflows). pi-subagents currently ships no skills; its `pi` field has `extensions` and `prompts` only.

No trigger detection: no `pi.on("input")` handler, no new module, no new command (see proposal).

## 1. Minimal injection edit

Edit the two existing strings.

Full variant (`src/index.ts:837`), append one sentence to the current text:

```
Pattern vocabulary and adaptable examples: load the fabric-workflows skill before authoring.
```

Compact variant (`src/index.ts:865`) becomes:

```
- For code-shaped multi-agent workflows, prefer fabric_exec; see fabric-workflows skill.
```

Gating unchanged: only appended when `detectPiFabric()` is true.

## 2. Skill

New directory `skills/fabric-workflows/`:

```
skills/fabric-workflows/
  SKILL.md                      # frontmatter (name, description), prerequisite note, pattern table, invariants, division-of-labor rule
  references/pattern-selection.md
  examples/fan-out-and-synthesize.ts
  examples/classify-and-act.ts
  examples/adversarial-verification.ts
  examples/generate-and-filter.ts
  examples/tournament.ts
  examples/loop-until-done.ts
```

Examples are fabric_exec program bodies (TypeScript, top-level await/return), written against pi-fabric's real API. Before authoring examples, read `/home/sil/.pi/agent/npm/node_modules/pi-fabric/skills/fabric-exec/SKILL.md` and its `references/agents.md` to confirm the exact `agents` / `workflow.agent()` contract; do not copy pi-dynamic-workflows' `agent()/parallel()/pipeline()` signatures.

Each example preserves: input validation and bounding before fan-out, stable IDs, unique labels, failure ledger with null-preserving coverage, plain structured return.

SKILL.md description must trigger on workflow-authoring intent (e.g. "authoring multi-agent orchestration programs in fabric_exec: fan-out, classification, adversarial verification, tournaments, loop-until-done"). The description is the primary discovery surface; there is no keyword trigger.

Packaging: package.json `"pi"` gains `"skills": ["./skills"]`.

Skill visibility is unconditional once packaged. Acceptable: content is inert without fabric_exec, and SKILL.md states the pi-fabric prerequisite in its first line.

## Alternatives rejected

- **Keyword trigger with per-turn arming banner** (earlier draft, modeled on pi-dynamic-workflows `pi.on("input")` transform): dropped by decision to avoid false-arming and prompt-transform complexity. Explicit skill invocation only.
- Shipping the skill in pi-fabric: pi-subagents owns the compat injection and routing story; upstreaming can happen later.
- Large injection rewrite naming all six shapes in the tool description: redundant once the skill description lists in `<available_skills>`; minimal pointer suffices.
- Quality-helper runtime functions (verify/judgePanel): runtime replication is a non-goal; expressed as prompt patterns inside examples instead.

## Test plan

- Manual: description injection with/without pi-fabric (existing detect path).
- Manual: skill appears in `<available_skills>` after install/reload.
- Live: each example program executed once via fabric_exec; fix API mismatches.
- Manual behavioral probe from requirements R4.
