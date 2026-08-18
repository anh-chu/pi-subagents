# 03 — Interpose Layer 2 into the dispatch path

**What to build:** Wire the dispatcher into the `Agent` dispatch chokepoint so that when Layer 1 admits with `needsJudgment`, the tool consults the dispatcher before spawning the target and acts deterministically on its verdict. ADMIT spawns the target; REJECT and REROUTE return structured feedback to the caller with no spawn. The dispatcher session is reused across validations rather than respawned. The gate is safe under concurrency saturation and cannot recurse. A single explicit, logged override lets an intentional unbounded writable dispatch skip Layer 2.

Validated end-to-end against the fixture from ticket 01; real built-in agents are still `loose` (their migration is ticket 04), so the fixture is the path that exercises judgment.

**Blocked by:** 01 and 02.

**Status:** ready-for-agent

- [ ] When Layer 1 sets `needsJudgment`, the tool consults the dispatcher before spawning; otherwise it spawns directly.
- [ ] ADMIT spawns the target; REJECT and REROUTE return structured feedback and do not spawn.
- [ ] The dispatcher session is long-lived and reused via `manager.resume`, not respawned per validation.
- [ ] The gate spawn uses `bypassQueue` and does not consume a user concurrency slot (no deadlock when the pool is saturated).
- [ ] Internal gate spawns carry `skipDispatchGate` and never re-enter the gate; the dispatcher holds no `Agent` tool.
- [ ] Infrastructure error or timeout fails open (dispatch proceeds, warning surfaced); an explicit REJECT fails closed.
- [ ] A single explicit, logged per-call override bypasses Layer 2 for an intentional unbounded writable dispatch; it is never a silent default.
- [ ] End-to-end against the fixture: a risky dispatch triggers the dispatcher and is admitted, rejected, or rerouted per its verdict; a non-risky dispatch never spawns the dispatcher.
- [ ] The `index.ts` handler stays thin; decidable logic lives in pure, unit-tested functions.
- [ ] `pnpm test`, typecheck, and lint pass.
