# Request for Plan: Grind Counter (inline-work telemetry + nudge)

Status: planning request. No implementation yet. Produce an implementation plan, not code.

## Problem

pi-subagents is a Pi coding-agent extension that provides the `Agent` tool for delegating work to subagents. Project instructions tell the main agent to delegate instead of grinding inline, but rules in prose do not hold under pressure. Measured evidence from heavy sessions on this machine:

- Session A (2,734 assistant messages): 2,066 inline tool calls (bash/read/edit/write/grep) vs 64 `Agent` dispatches. Longest uninterrupted bash streak: 34 calls. Longest stretch without any `Agent` dispatch: 394 tool calls. ~891k output tokens.
- Session B (629 messages): all implementation inline, ~810k output tokens.
- Session C (563 messages): 312 inline calls vs 29 dispatches, plus 110 task-tracker updates (each rewrites the full list as output tokens).

Goal: convert the delegation rule from memory into mechanical feedback, the same way `guardAgentSpawn` already gates concurrency mechanically.

## Desired behavior (shape, open to refinement)

1. Track consecutive main-session tool calls that are not `Agent` dispatches (and are not trivial/free calls; classification TBD in plan).
2. At a threshold (default ~25 consecutive non-dispatch calls, configurable), inject a single short nudge visible to the model, e.g. one system-ish line: "N consecutive inline calls without delegation. Consider dispatching worker/Explore or restarting with a brief."
3. Detect debug spirals specifically: M consecutive `bash` calls (default ~8) triggers a targeted nudge suggesting a worker dispatch with a reproduction brief.
4. Counters reset on `Agent` dispatch. Nudges must be rate-limited (no repeat within X calls) so they never spam context.
5. Optional: a small status widget showing current streak, and a `/grind-status` command for the user.

## Constraints

- Implement inside this repo (pi-subagents) as part of the existing extension, not a separate package.
- Follow existing architecture: `src/index.ts` owns the `Agent` tool definition and dispatch; `src/agent-guards.ts` owns reusable guard logic and is unit-tested in `test/agent-guards.test.ts`; `src/agent-runner.ts` / `src/agent-manager.ts` own lifecycle.
- Pure counting logic must live in a testable module like agent-guards (no Pi API coupling); the Pi event wiring stays thin in index.ts.
- Consult the Pi extension API docs before choosing the event mechanism: the package `@earendil-works/pi-coding-agent` ships `docs/extensions.md` and `examples/extensions/` (if these docs are not in this bundle, ask for them; do not invent Pi APIs from memory). Key unknowns the plan must resolve: which Pi extension hook observes tool calls made by the main session, and what mechanism exists for injecting a message the model sees (context injection, tool-result note, or widget only).
- Minimal code. No config system beyond a couple of constants or a tiny settings object. No persistence across sessions.
- Must not alter or delay actual tool execution. Observation and nudging only. Never block.
- Nudge text must be one or two lines. Token cost of the mechanism must be near zero when no threshold is hit.

## Non-goals

- No automatic dispatching or automatic session restarts.
- No hard blocking of inline tools.
- No analytics dashboard, log files, or cross-session aggregation.
- No changes to subagent-side behavior; this observes the main session only.

## Acceptance examples

- 25 consecutive inline calls in the main session produce exactly one nudge; the 26th-49th produce none; a fresh nudge is allowed after the rate-limit window.
- An `Agent` dispatch at call 20 resets the counter; no nudge fires.
- 8 consecutive `bash` calls produce the debug-spiral nudge even if the general threshold is not reached.
- Counting logic covered by unit tests in the style of `test/agent-guards.test.ts`, with no Pi runtime needed.

## Requested plan shape

1. Chosen Pi extension hook(s) for observing tool calls and for surfacing the nudge, with doc references.
2. File-by-file change list (new module, index.ts wiring, tests).
3. Counting/reset/rate-limit state machine described precisely.
4. Risks and open questions, each with a recommendation.
5. Estimated diff size. If it exceeds ~300 lines, propose a smaller first cut.

Note for the implementing session: plan arrives unverified; validate file paths and API claims against the live repo and Pi docs before coding.
