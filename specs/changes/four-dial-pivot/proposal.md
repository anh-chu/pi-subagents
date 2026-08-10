# Proposal: Four-Dial Agent Dispatch Model

## Vision

Simplify agent-based task decomposition by treating Agent as a minimalist orchestration tool with four independent "dials": brief (prompt), brain (model + thinking), powers (agent type preset or bare default), knowledge (skills referenced in brief, not separate parameter).

Decoupling these concerns reduces schema bloat, clarifies the caller's role as orchestrator, and enables a thin guidance layer (lifecycle-script-managed AGENTS.md) rather than embedded routing rules.

## Problem

Current tool makes `subagent_type` mandatory and embeds agent capability/tool profiles, model defaults, and routing guidance into the tool schema and system prompts. This creates friction:

1. **Schema bloat.** Mandatory `subagent_type` forces all callers to specify a type even for bare general-purpose dispatch.
2. **Prescriptive system prompts.** Built-in personas include task methodologies and routing heuristics (200+ line prompts), conflating agent identity with caller intent.
3. **Immobile guidance.** Tool description carries detailed routing tables and thresholds embedded in the description string; hard to update without redeploying the extension.
4. **No coordination support.** Tool description lacks brief scaffolding or model-tier guidance; coordinators must invent handoff structure from scratch.

## Solution

1. **Optional `subagent_type`.** Omitting it triggers bare general-purpose dispatch with default powers (all tools unless caller restricts via other means). Built-in types remain available for preset capability/tool profiles.

2. **Thin system prompts.** Reduce all default agent prompts to <15 lines: capability posture + output contract only. Task methodology and routing rules move to AGENTS.md.

3. **Lifecycle script guidance.** On install, a postinstall script creates/updates a marked block in global `~/.pi/agent/AGENTS.md` with:
   - Four-dial concept explanation
   - Workflow design guidance: decompose tasks into a delegation shape (sequential, parallel fan-out, dispatch-review-iterate), choose per step between bare dispatch, built-in templates, and custom agents; write self-contained briefs.
   - Routing principle: use the cheapest brain for the job; escalate model strength with ambiguity, stakes, review depth; concrete models listed in Agent tool description.
   - Brief scaffold (Goal/Context/Scope/Acceptance/Return)
   - Skill-reference-by-path pattern (cite .md files in the brief instead of a skills parameter)

4. **Clean tool description.** Remove routing tables and thresholds. Keep schema, agent-type catalog (minimal descriptions), hard invariants only. Dynamic model catalog (available models from pi configuration). Fabric section when pi-fabric is installed.

5. **Six built-in personas condensed, orchestrator elaborate.** general-purpose, Explore, Plan, worker, reviewer, oracle reduced to <15 lines (capability + output contract). Orchestrator is the single exception: ~30-40 lines, focused on active supervision (dispatch with complete briefs, monitor via periodic check-ins, steer drift early, review before accepting, iterate).

6. **Mid-run check-in ergonomics.** get_subagent_result for a running agent returns status, turn count, recent tool activity, partial output tail (no new tools, no polling loops).

## Outcomes

- Coordinators explicitly orchestrate: brief selection, model choice, type pick, skill reference.
- Built-in agent personas remain available but unobtrusive; project/global custom agents thrive.
- Installation auto-seeds global AGENTS.md with guidance; updates preserve user edits outside the marked block.
- Tool description is concise, dynamic (lists available models), adapts to installed tools (fabric when present).
- Orchestrator template embeds supervision methodology; observation-driven iteration replaces fire-and-forget dispatch.
- get_subagent_result for running agents supports mid-loop coordination (check status, recent work, decide next step).

## Non-Goals

- Push-based progress notifications or polling loops.
- Fabric replacement (fabric_exec is a complement for long code-shaped workflows, not a replacement for Agent).
- Removal of agent registry, built-in types, or core dispatch machinery.
- Changes to guards, runner, manager beyond what optional `subagent_type` requires.
- Changes to steering, resume, schedule.
