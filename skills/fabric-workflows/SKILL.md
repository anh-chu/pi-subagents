---
name: fabric-workflows
description: >
  Author multi-agent orchestration programs in fabric_exec. Use when a task has a
  decomposable dependency structure: parallel fan-out with synthesis, classify-and-act
  routing, adversarial verification of claims, generate-and-filter exploration,
  pairwise tournament comparison, or loop-until-done over unknown cardinality.
  Requires the pi-fabric extension (fabric_exec tool).
---

# fabric-workflows

Requires pi-fabric: every example is a `fabric_exec` program body (TypeScript, top-level await and return) using the `agents` API. Without fabric_exec this skill does not apply.

## Division of labor

TypeScript owns enumeration, identity, ordering, deduplication, bounds, stopping, brackets, and failure ledgers. Agents own semantic work only. Never ask an agent to enumerate, count, dedupe, or decide when to stop; never do semantic judgment in code.

## Universal invariants

Apply these in every adapted program:

- Validate and bound input before fan-out. Cap item counts explicitly; reject or truncate oversized input in code.
- Give every work unit a stable ID and every agent call a unique `name` like `phase:index:id`.
- Preserve missing coverage. A failed or null result stays in the ledger under its ID; never silently drop it. Synthesis must receive every intended ID, including failures, and distinguish covered from missing.
- Wrap each `agents.run` in try/catch; record `{ id, ok, error? }` in a failure ledger.
- Return plain structured data (JSON-safe), not prose, from the program. Include the ledger in the return value.
- Use `schema` on agent calls whenever downstream code branches on the result; read `result.value`.

## Pattern selection

Choose by data-dependency shape, then adapt the matching example. See [references/pattern-selection.md](references/pattern-selection.md) for the table and per-pattern invariants.

| Dependency shape | Pattern | Example |
| --- | --- | --- |
| Heterogeneous items need different handling | Classify and act | [examples/classify-and-act.ts](examples/classify-and-act.ts) |
| Independent work needs whole-set judgment | Fan out and synthesize | [examples/fan-out-and-synthesize.ts](examples/fan-out-and-synthesize.ts) |
| Claims need skeptical checks | Adversarial verification | [examples/adversarial-verification.ts](examples/adversarial-verification.ts) |
| Exploration should diverge before one rubric | Generate and filter | [examples/generate-and-filter.ts](examples/generate-and-filter.ts) |
| Pairwise comparison beats absolute scoring | Tournament | [examples/tournament.ts](examples/tournament.ts) |
| Work cardinality is unknown | Loop until done | [examples/loop-until-done.ts](examples/loop-until-done.ts) |

Combine patterns only when the task genuinely has both dependency shapes. Direct work needs no orchestration: a single bounded task is one `agents.run` call or no agent at all.

## API essentials

- `agents.run({ name, task, tools?, model?, schema? })` runs one child agent to completion; returns `{ status, text, value?, error?, usage }`. `schema` (JSON Schema) makes `value` validated structured data.
- Parallel fan-out is `Promise.all` over `agents.run` calls; Fabric's agent semaphore bounds real concurrency, but still bound the item count in code.
- Read-only recon agents get `tools: ["read", "grep", "find", "ls"]`.
- Full contract: pi-fabric's `fabric-exec` skill, `references/agents.md`.
