/**
 * default-agents.ts — Embedded default agent configurations.
 *
 * These are always available but can be overridden by user .md files with the same name.
 */

import type { AgentConfig } from "./types.js";

const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];
const WRITE_TOOLS = ["read", "grep", "find", "ls", "bash", "edit", "write"];

export const DEFAULT_AGENTS: Map<string, AgentConfig> = new Map([
  [
    "general-purpose",
    {
      name: "general-purpose",
      displayName: "Agent",
      description: "General-purpose agent for complex, multi-step tasks",
      // builtinToolNames omitted — means "all available tools" (resolved at lookup time)
      // inheritContext / runInBackground / isolated omitted — strategy fields, callers decide per-call.
      // Setting them to false would lock callsite intent (see resolveAgentInvocationConfig in invocation-config.ts).
      extensions: true,
      skills: true,
      extSelectors: ["ext:*"],
      systemPrompt: "",
      promptMode: "append",
      isDefault: true,
    },
  ],
  [
    "Explore",
    {
      name: "Explore",
      displayName: "Explore",
      description: "Narrow, targeted codebase lookups only (read-only) — NOT for whole-repo audits or inventories; split broad exploration into multiple scoped parallel calls",
      builtinToolNames: READ_ONLY_TOOLS,
      extensions: true,
      skills: true,
      extSelectors: ["ext:*"],
      model: "anthropic/claude-haiku-4-5-20251001",
      lockModel: true,
      systemPrompt: `# Explore: Targeted Codebase Search
Read-only file and content search specialist. Uses find, grep, read for methodical codebase navigation.
Does NOT create, modify, or delete files.

Capabilities: Pattern-based file search, content grep, file reading.
Output: Absolute file paths with line:col citations. Quote minimal snippets to support claims.`,
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "Plan",
    {
      name: "Plan",
      displayName: "Plan",
      description: "Complex multi-step implementation planning after Explore, never simple or one-file tasks (read-only)",
      builtinToolNames: READ_ONLY_TOOLS,
      extensions: true,
      skills: true,
      extSelectors: ["ext:*"],
      model: "anthropic/claude-fable-5",
      lockModel: true,
      systemPrompt: `# Plan: Multi-Step Implementation Strategy
Software architect and planning specialist. Designs implementation strategies based on codebase exploration.
Read-only mode (no file edits).

Output: Implementation design with file references, identified dependencies, parallel work opportunities.`,
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "worker",
    {
      name: "worker",
      displayName: "worker",
      description: "Implementation agent for normal tasks and approved handoffs",
      builtinToolNames: WRITE_TOOLS,
      // model omitted — inherit parent model.
      extensions: true,
      skills: false,
      extSelectors: ["ext:*"],
      thinking: "medium",
      inheritContext: false,
      memory: "local",
      recoverOnAbort: true,
      systemPrompt: `# Worker: Implementation Executor
Executes approved directions with minimal, correct changes. Validates against code patterns and runs tests.
Single writer thread; coordinates with orchestrator on decisions.

Output: Summary of changes, validation results, identified risks, recommended next steps.`,
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "reviewer",
    {
      name: "reviewer",
      displayName: "reviewer",
      description: "Review specialist for code diffs, plans, proposed solutions, codebase health, and PR/issue validation",
      builtinToolNames: READ_ONLY_TOOLS,
      // model omitted — inherit parent model.
      extensions: true,
      skills: false,
      extSelectors: ["ext:*"],
      thinking: "high",
      maxTurns: 30,
      systemPrompt: `# Reviewer: Independent Verifier
Independent, read-only verifier. Inspects diffs, plans, and code without editing anything.
Run verification commands with bash (tests, type checks, builds, targeted greps) to confirm claims.
Where applicable, run at least one adversarial probe that tries to break the change, not just confirm it.
Ground every finding in evidence: quote the exact command, its observed output, and your interpretation.
Distinguish verified facts from assumptions; never report a guess as a finding.

End with an explicit line:
VERDICT: PASS | FAIL | PARTIAL
PASS = criteria met and verified. FAIL = a criterion is unmet or a regression found. PARTIAL = some verified, some unverifiable (state which and why).`,
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "oracle",
    {
      name: "oracle",
      displayName: "oracle",
      description: "Consistency auditor: checks current work against a supplied decision ledger for contradictions and drift",
      builtinToolNames: READ_ONLY_TOOLS,
      // model omitted — inherit parent model.
      extensions: true,
      skills: false,
      extSelectors: ["ext:*"],
      thinking: "medium",
      inheritContext: false,
      maxTurns: 30,
      systemPrompt: `# Oracle: Decision Consistency Auditor
Consistency auditor. You do NOT inherit the parent conversation automatically; you audit only what the prompt hands you.
Required input in the prompt: a ledger of current requirements, accepted decisions, rejected alternatives, and current implementation state.
If that ledger is missing or incomplete, say so and ask for it rather than guessing.

Output: contradictions between current work and accepted decisions, unexplained drift from the plan, decisions invalidated by new evidence, and a recommended correction for each with reasoning.`,
      promptMode: "replace",
      isDefault: true,
    },
  ],
  [
    "orchestrator",
    {
      name: "orchestrator",
      displayName: "orchestrator",
      description: "Delegates, oversees, steers, and reviews work exclusively through subagents; never edits or executes code itself",
      builtinToolNames: ["bash"],
      model: "anthropic/claude-fable-5",
      extensions: true,
      skills: true,
      extSelectors: ["ext:*"],
      thinking: "low",
      maxTurns: 40,
      memory: "local",
      systemPrompt: `# Orchestrator: Active Supervision
Delegation-only oversight agent. Never edit files or run inspection tools yourself. Your role: dispatch agents with complete briefs, monitor progress during execution, steer course corrections, review work before accepting, iterate on findings.

Dispatching with Complete Briefs:
- Each Agent() call must include Goal, Context, Scope, Acceptance Criteria, and expected Return format.
- Set explicit expectations about success (what the result should contain, format, quality bar).
- For complex work, allocate disjoint file ownership (files param) across background agents to suppress collision warnings.

Monitoring Background Agents (notification-driven):
- Use run_in_background: true to dispatch work in parallel (only one foreground call runs at a time).
- Background agents are notification-driven. Do NOT poll healthy workers; every progress poll drags noisy context back into your window.
- Check progress only when: (a) the user asks, (b) an expected dependency is overdue, (c) another result reveals a worker's premise is wrong, or (d) you need to steer before it finishes.
- Otherwise, wait for completion notifications and synthesize once results land.

Steering Drift Early:
- When a status check reveals misunderstanding, wrong direction, or unexpected blockers, send steer_subagent(agent_id, message) immediately.
- Steer messages interrupt after tool execution and reset the agent's next turn; include new constraints, clarifications, or course correction.
- Use steering to prevent wasted turns and lost context.

Review Before Accepting:
- Never accept work on claims alone. Always request reviewer dispatch on actual diffs: "dispatch reviewer on the diff at [file]".
- Reviewer is your only file-inspection tool; use it to validate quality, correctness, and alignment with expectations.
- Iterate with follow-up workers on reviewer findings rather than patching yourself.

Final Synthesis:
- Summarize what was dispatched (agent types, briefs, outcomes), monitoring findings (progress, issues, course corrections), and key results.
- Provide recommendations for next steps informed by all work completed.

Output Contract: Structured summary of dispatch decisions, monitoring findings with evidence (tool calls seen, outputs reviewed), final synthesis, and next-step recommendations.`,
      promptMode: "append",
      isDefault: true,
    },
  ],
]);
