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
      contract: {
        type: "object",
        required: ["goal"],
        properties: {
          goal: { type: "string" },
          context: { type: "string" },
          return_format: { type: "string" },
        },
      },
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
      description: "Narrow, targeted codebase lookups only (read-only). Use for finding files, tracing code paths, and locating symbols. Do NOT use for broad audits, bug replication, or behavior verification (use worker or general-purpose for those). Split broad exploration into multiple scoped parallel calls",
      contract: {
        type: "object",
        required: ["goal", "scope"],
        properties: {
          goal: { type: "string" },
          scope: { type: "string" },
          return_format: { type: "string" },
        },
      },
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
      contract: {
        type: "object",
        required: ["goal", "context"],
        properties: {
          goal: { type: "string" },
          context: { type: "string" },
          constraints: { type: "string" },
        },
      },
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
      description: "Implementation agent for scoped code edits, bug fixes, bug replication, and feature implementation. Uses tools to write and modify code.",
      contract: {
        type: "object",
        required: ["goal", "context", "scope", "acceptance"],
        properties: {
          goal: { type: "string" },
          context: { type: "string" },
          scope: {
            type: "object",
            required: ["includes"],
            properties: { includes: { type: "array", items: { type: "string" } } },
          },
          acceptance: { type: "array", items: { type: "string" } },
        },
      },
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
Single writer thread; coordinates with the dispatching agent on decisions.

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
      description: "Review specialist for code diffs, plans, and proposed solutions. Verifies changes against requirements and produces evidence-based findings. NOT for open-ended debates, brainstorming, architecture discussions, or general reasoning (use oracle or main agent instead).",
      contract: {
        type: "object",
        required: ["goal", "context", "scope"],
        properties: {
          goal: { type: "string" },
          context: { type: "string" },
          scope: { type: "string" },
          acceptance: { type: "array", items: { type: "string" } },
        },
      },
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
      description: "Expensive, high-capability agent for second opinions, hard judgment calls, and consultation. Works from a curated brief, not the full transcript.",
      contract: {
        type: "object",
        required: ["question", "context"],
        properties: {
          question: { type: "string" },
          context: { type: "string" },
          options_considered: { type: "array", items: { type: "string" } },
        },
      },
      builtinToolNames: READ_ONLY_TOOLS,
      // model omitted — inherit parent model.
      extensions: true,
      skills: false,
      extSelectors: ["ext:*"],
      thinking: "medium",
      inheritContext: false,
      maxTurns: 30,
      systemPrompt: `# Oracle: Second-Opinion Consultant
The expensive, high-capability agent reached for when a hard call, second opinion, or expert consultation is needed. You advise; you do not execute.
You do NOT inherit the parent conversation. The invoking agent must hand you a curated brief: the question, relevant context, constraints, options already considered, and current state. Work only from what the brief gives you, never from an assumed transcript.
If the brief is too thin to advise well, say exactly what is missing and ask for it rather than guessing.

Output: a direct recommendation, the reasoning behind it, the key trade-offs, risks or blind spots the caller may have missed, and (when relevant) any contradictions or drift from the decisions stated in the brief.`,
      promptMode: "replace",
      isDefault: true,
    },
  ],
]);
