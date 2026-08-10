# @tintinweb/pi-subagents

[![npm version](https://img.shields.io/npm/v/@tintinweb/pi-subagents.svg?style=flat-square)](https://www.npmjs.com/package/@tintinweb/pi-subagents)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

A [pi](https://pi.dev) extension that brings **Claude Code-style autonomous sub-agents** to pi. Spawn specialized agents in isolated sessions with custom tools, prompts, models, and thinking levels. Run them foreground or background, steer them live, resume sessions, define custom types, and schedule recurring work. Built for multi-agent workflows: real parallelism, nested spawning, robust observability, and workflow orchestration.

<p>
  <img width="650" alt="pi-subagents screenshot" src="https://github.com/tintinweb/pi-subagents/raw/master/media/screenshot.png" />
</p>

**[Watch demo](https://github.com/tintinweb/pi-subagents/raw/master/media/demo.mp4)** (3min)

## Why pi-subagents

Most multi-agent tools spawn a child and wait for completion. pi-subagents is a **workflow engine** with observability and control for serious work:

- **Real parallelism.** Launch many agents at once with automatic queuing. Foreground and background agents coexist. Nested agents spawn subagents. Parallel workers declare file ownership to avoid collisions.
- **You see everything.** Live widget shows spinners, tool activity, token usage, and context-window health per agent. Open any agent's full conversation live. Completion notifications are styled, not raw XML.
- **Built-in workflows.** Ships `/feature`, `/feature-light`, `/execute-plan`, and `/orchestrate` slash commands that wire ready-made scout→plan→implement→review→fix pipelines. You get real work on install.
- **Long-running work.** Steer agents mid-run, resume finished sessions, graceful turn limits (wrap-up warning before abort), git worktree isolation for safe parallel edits, scheduled jobs (cron/interval/one-shot).
- **Agent Mode.** Test an agent's perspective interactively: `/agent-mode <name>` to switch to a fresh configured session, `@@` autocomplete picker for quick access, `/agent-mode-off` to return. Full isolation, breadcrumb navigation.
- **Unopinionated coordination.** The parent agent drives the workflow — no hidden chains, no opaque retries. Dispatch Agent() calls, read results, synthesize, write the next prompt. Full transparency.

## Contents

- [Quick Start](#quick-start)
- [Installation & Development](#installation--development)
- [Core Concepts](#core-concepts)
- [Tools](#tools)
  - [Agent](#agent)
  - [get_subagent_result](#get_subagent_result)
  - [steer_subagent](#steer_subagent)
- [Bundled Agent Types](#bundled-agent-types)
  - [orchestrator](#orchestrator)
- [Custom Agents](#custom-agents)
- [UI & Commands](#ui--commands)
  - [Live Widget](#live-widget)
  - [/agents Command](#agents-command)
  - [Prompt Templates](#prompt-templates)
- [Features](#features)
  - [Parallel Background Agents](#parallel-background-agents)
  - [Nested Subagents](#nested-subagents)
  - [Scheduling](#scheduling)
  - [Agent Mode](#agent-mode)
  - [Worktree Isolation](#worktree-isolation)
  - [Context Inheritance](#context-inheritance)
  - [Persistent Agent Memory](#persistent-agent-memory)
  - [Graceful Max Turns](#graceful-max-turns)
  - [Recovery on Abort](#recovery-on-abort)
  - [Skill Preloading](#skill-preloading)
  - [Tool Denylist](#tool-denylist)
  - [Grind Counter](#grind-counter)
  - [Cross-Extension RPC](#cross-extension-rpc)
  - [Events](#events)
  - [pi-intercom Bridge](#pi-intercom-bridge)
  - [Output Transcripts](#output-transcripts)
- [Settings & Configuration](#settings--configuration)
- [Architecture & Development](#architecture--development)
- [License](#license)

---

## Quick Start

### Install

```bash
pi install npm:@tintinweb/pi-subagents
```

Or load directly for development:

```bash
pi -e ./src/index.ts
```

### First Agent

The parent agent spawns sub-agents using the `Agent` tool:

```typescript
Agent({
  subagent_type: "Explore",
  description: "Find auth files",
  prompt: "Search for all files handling authentication",
})
```

Runs in background by default (returns immediately with an agent ID). Retrieve the result later via `get_subagent_result`. To block and get result inline, set `run_in_background: false`.

### Parallel Work

Launch multiple agents at once for independent work:

```typescript
Agent({
  subagent_type: "Explore",
  description: "Scout frontend",
  prompt: "Find authentication components in src/ui",
  run_in_background: true,
})

Agent({
  subagent_type: "Explore",
  description: "Scout backend",
  prompt: "Find authentication endpoints in src/api",
  run_in_background: true,
})
```

Both run concurrently. The parent agent continues and waits for results via `get_subagent_result`. Automatic queuing respects `maxConcurrent` (default 4).

---

## Installation & Development

### Requirements

- `@mariozechner/pi-ai` ≥ 0.70.5
- `@mariozechner/pi-coding-agent` ≥ 0.70.5
- `@mariozechner/pi-tui` ≥ 0.70.5

### Dev Setup

```bash
git clone https://github.com/tintinweb/pi-subagents.git
cd pi-subagents
npm install

# Run tests
npm run test
npm run test:watch

# Typecheck
npm run typecheck

# Lint
npm run lint
npm run lint:fix

# Build
npm run build

# Load in pi
pi -e ./src/index.ts
```

### Commands

All scripts in `package.json`:

```bash
npm run test              # Run vitest once
npm run test:watch       # Watch mode
npm run typecheck        # TypeScript without emit
npm run lint             # Lint src/ and test/
npm run lint:fix         # Auto-fix lint issues
npm run build            # Compile TypeScript
npm run prepublishOnly   # Full pre-publish check (lint, typecheck, test, build)
```

---

## Core Concepts

### Coordinator Pattern

pi-subagents uses the **coordinator pattern**: the parent agent orchestrates multi-step workflows by dispatching `Agent()` calls, reading results, and synthesizing understanding. No hidden chains, no implicit retries — full transparency.

```
┌─────────────────────────┐
│  Parent (Orchestrator)  │
│                         │
│ 1. Dispatch Agent()     │
│ 2. Read result          │
│ 3. Synthesize           │
│ 4. Write next prompt    │
│ 5. Repeat               │
└─────────────────────────┘
        │        ▲
        │ spawn  │ result
        ▼        │
    ┌──────────────────┐
    │  Sub-agent (A)   │
    └──────────────────┘
```

### Foreground vs. Background

- **Foreground** (`run_in_background: false`): Blocks the parent. Results return inline in the conversation. Best for sequential work or when immediate feedback is critical. Pressing **ESC** during a foreground Agent call aborts the child agent immediately (AbortSignal forwarded to session).
- **Background** (`run_in_background: true`, default when not specified): Parent continues immediately, receives an agent ID, and gets notified on completion. Best for parallel work.

### Files Ownership

When spawning multiple agents, declare which files each owns to prevent collisions:

```typescript
Agent({
  subagent_type: "worker",
  description: "Refactor auth module",
  prompt: "...",
  files: ["/path/to/src/auth.ts", "/path/to/src/auth.test.ts"],
  run_in_background: true,
})

Agent({
  subagent_type: "worker",
  description: "Refactor API routes",
  prompt: "...",
  files: ["/path/to/src/api.ts", "/path/to/src/api.test.ts"],
  run_in_background: true,
})
```

Disjoint file sets suppress collision warnings. Overlapping files trigger a warning and are not blocked.

### Nested Subagents

A subagent can spawn its own subagents (up to depth 2 by default):

```
Real session (depth 0)
  ├─ worker (depth 1)
  │   ├─ Explore (depth 2)
  │   └─ reviewer (depth 2)
  └─ general-purpose (depth 1)
```

Depth-2 agents do not receive spawning tools, so nesting stops automatically. Display in the widget is tree-nested, matching the spawn graph.

---

## Tools

### Agent

Launch a sub-agent to handle a task autonomously.

**Parameters:**

| Parameter           | Type         | Required | Default             | Description                                                                                    |
| ------------------- | ------------ | -------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `prompt`            | string       | ✓        | —                   | Task description for the agent (can be multi-sentence; detailed is better)                     |
| `description`       | string       | ✓        | —                   | Short 3–5 word summary shown in UI and widgets                                                |
| `subagent_type`     | string       | –        | general-purpose     | Agent type: built-in or custom (e.g. `"Explore"`, `"worker"`, `"auditor"`). Omit for bare general-purpose dispatch.                    |
| `model`             | string       | –        | parent model        | Model ID or fuzzy name (e.g. `"anthropic/claude-opus"`, `"haiku"`, `"sonnet"`). Fuzzy names match available models. |
| `thinking`          | string       | –        | inherit             | Extended thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`                    |
| `max_turns`         | number       | –        | unlimited           | Max agentic turns before graceful shutdown. Omitted or ≥1 = that limit; must be ≥1 in tool input (0 valid only in settings/frontmatter). Agents get a "wrap up" warning at the limit. |
| `run_in_background` | boolean      | –        | true                | Run without blocking (background). Set to `false` to block and get result inline.              |
| `resume`            | string       | –        | —                   | Agent ID to resume a previous session (preserves conversation history)                         |
| `files`             | string[]     | –        | —                   | File paths this agent owns for collision detection (disjoint = suppresses warnings)           |
| `inherit_context`   | boolean      | –        | false               | Fork parent conversation into agent (agent sees the thread so far)                            |
| `isolation`         | `"worktree"` | –        | —                   | Run in isolated git worktree (safe parallel edits, branches auto-created)                      |
| `schedule`          | string       | –        | —                   | Schedule to fire later instead of now: cron (`"0 0 9 * * 1"`), interval (`"5m"`), or one-shot (`"+10m"`, ISO timestamp). Forces background. |

**Returns:** Result object with `content` (text) and `details` (metadata). For background agents, returns immediately with agent ID.

**Examples:**

```typescript
// Foreground exploration
const result = await Agent({
  subagent_type: "Explore",
  description: "Find payment handlers",
  prompt: "Search for all files that process payments, look for API calls to stripe or paypal",
})

// Background implementation
Agent({
  subagent_type: "worker",
  description: "Refactor auth",
  prompt: "Move auth logic from auth.ts to auth/index.ts, update imports",
  files: ["/src/auth.ts", "/src/auth/index.ts"],
  max_turns: 20,
  run_in_background: true,
})

// Scheduled job
Agent({
  subagent_type: "Explore",
  description: "Weekly review",
  prompt: "Summarize changes since last week",
  schedule: "0 0 9 * * 1",  // 9am every Monday
})
```

### get_subagent_result

Check status or retrieve results from a background agent.

**Parameters:**

| Parameter  | Type    | Required | Default | Description                                                 |
| ---------- | ------- | -------- | ------- | ----------------------------------------------------------- |
| `agent_id` | string  | ✓        | —       | The agent ID (returned when spawning in background)         |
| `wait`     | boolean | –        | false   | If true, block until completion. If false, return current status. |
| `verbose`  | boolean | –        | false   | If true, include full conversation log. If false, return result only. |

**Returns:** Formatted text with agent metadata, status, result/error, and optional full conversation. Status values: `running`, `completed`, `error`, `stopped`, `aborted`, `queued`, `steered`.

**Examples:**

```typescript
// Check status (non-blocking)
const status = get_subagent_result({ agent_id: "agent-abc123" })
if (status.includes("completed")) {
  console.log(status)
}

// Wait for completion
const final = get_subagent_result({ agent_id: "agent-abc123", wait: true })

// Get full conversation
const detailed = get_subagent_result({ agent_id: "agent-abc123", verbose: true })
```

### steer_subagent

Send a message to a running agent. The message interrupts after the current tool execution.

**Parameters:**

| Parameter  | Type   | Required | Description                                           |
| ---------- | ------ | -------- | ----------------------------------------------------- |
| `agent_id` | string | ✓        | The running agent ID                                  |
| `message`  | string | ✓        | Message to inject (e.g. "Focus on X", "Skip Y", etc.) |

**Returns:** Confirmation that the message was queued.

**Use case:** Mid-run correction without restarting:

```typescript
// Agent is searching broadly, but we realize scope is wrong
steer_subagent({ agent_id: "agent-xyz789", message: "Actually, focus only on the auth module, ignore everything else" })
```

---

## Four-Dial Orchestration and Coordination

pi-subagents follows a **four-dial model** for agent dispatch: treat each Agent call as independent tuning of four concerns: **brief** (prompt), **brain** (model + thinking), **powers** (agent type), and **knowledge** (skills cited in the brief, not a separate parameter).

This decoupling clarifies the coordinator's role and enables lean, dynamic orchestration.

### Optional `subagent_type`

The `subagent_type` parameter is now **optional**. Omit it to dispatch a bare general-purpose agent with access to all available tools:

```typescript
// Explicit general-purpose (old style, still works)
Agent({
  subagent_type: "general-purpose",
  description: "Analyze logs",
  prompt: "Review the error logs and summarize recurring patterns",
})

// Implicit general-purpose (new style, same behavior)
Agent({
  description: "Analyze logs",
  prompt: "Review the error logs and summarize recurring patterns",
})
```

Both are identical. Omitting the type is cleaner for simple tasks that don't require a specialized agent profile.

### Workflow Design: Sequential, Parallel, and Dispatch-Review-Iterate

When orchestrating multi-agent work, structure it around three patterns:

**Sequential:** One task depends on the previous output.
```typescript
const explore = await Agent({
  subagent_type: "Explore",
  description: "Understand auth flow",
  prompt: "Find all authentication files and flow",
  run_in_background: false,  // Wait for result
})

const plan = await Agent({
  subagent_type: "Plan",
  description: "Plan refactor",
  prompt: `Based on these findings, design a plan:\n\n${explore}`,
  run_in_background: false,
})
```

**Parallel:** Independent tasks can run simultaneously.
```typescript
Agent({
  subagent_type: "Explore",
  description: "Find frontend auth",
  prompt: "Search for auth components in src/ui",
  files: ["src/ui"],
  run_in_background: true,
})

Agent({
  subagent_type: "Explore",
  description: "Find backend auth",
  prompt: "Search for auth handlers in src/api",
  files: ["src/api"],
  run_in_background: true,
})

// Gather results later with get_subagent_result
```

**Dispatch-Review-Iterate:** Send work out, review results, then iterate based on findings.
```typescript
// Dispatch implementation
const impl = await Agent({
  subagent_type: "worker",
  description: "Implement refactor",
  prompt: "Refactor auth as described in the plan",
  files: ["src/auth.ts"],
  run_in_background: false,
})

// Review the diff
const review = await Agent({
  subagent_type: "reviewer",
  description: "Review implementation",
  prompt: `Check this implementation for correctness and fit:\n\n${impl}`,
  run_in_background: false,
})

// If review finds issues, iterate with a follow-up worker
if (review.includes("issue")) {
  await Agent({
    subagent_type: "worker",
    description: "Fix issues",
    prompt: `Address these issues from the review:\n\n${review}`,
    files: ["src/auth.ts"],
    run_in_background: false,
  })
}
```

### Model Tier Routing: Workload-Based Guidance

Choose models based on workload, not by vendor name. Use this tiered language:

- **Cheap:** Extraction, search, fast reconnaissance, grunt work (e.g., Explore reading files, simple grep tasks).
- **Mid:** Bounded implementation, planning, review with clear scope (e.g., worker implementing a small feature, Plan designing a refactor).
- **Strongest available:** Ambiguous design decisions, high-stakes review, complex reasoning (e.g., orchestrator deciding workflow direction, reviewer on critical security code).

Concrete model defaults for built-in agents are listed in the agent descriptions below (e.g., "Explore is preset to haiku"), but tier routing is workload-driven: dispatch the right agent type for your task, then optionally override the model if you need more or fewer resources.

### Orchestrator Role: Active Supervision

The **orchestrator** agent type is unique: it focuses on active supervision methodology, not just task execution.

When using the orchestrator, follow this loop:

1. **Dispatch** agents with complete, self-contained briefs. Set expectations for what success looks like.
2. **Monitor** running background agents via periodic `get_subagent_result()` calls. Capture progress and blockers.
3. **Steer** drift early using `steer_subagent()` when you discover new constraints or misunderstandings.
4. **Review** work before accepting it. Dispatch a `reviewer` to verify diffs, not yourself.
5. **Iterate** with follow-up workers on review findings. Never fire-and-forget.

Example orchestrator loop:
```typescript
// Dispatch implementation
const workerId = (await Agent({
  subagent_type: "worker",
  description: "Refactor module",
  prompt: "Refactor src/auth.ts according to the plan...",
  files: ["src/auth.ts"],
  run_in_background: true,  // Background so we can monitor
})).details.agentId

// Monitor progress
await new Promise(resolve => {
  const checkLoop = setInterval(async () => {
    const status = await get_subagent_result({ agent_id: workerId })
    if (status.includes("still running")) {
      console.log("Still working...")
    } else {
      clearInterval(checkLoop)
      resolve(status)
    }
  }, 5000)  // Check every 5 seconds
})

// Review the result before accepting
const review = await Agent({
  subagent_type: "reviewer",
  description: "Review refactor",
  prompt: `Review this refactoring for correctness and fit...`,
  run_in_background: false,
})
```

For detailed coordination guidance, see `~/.pi/agent/AGENTS.md` (created on install). That file contains workflow examples, brief scaffolds, and skill reference patterns.

### Brief Scaffold: Goal, Context, Scope, Acceptance, Return

When writing agent prompts, use this optional scaffold to ensure complete, self-contained briefs:

```
Goal: [What outcome are you aiming for?]

Context: [What is the current state? What have you already tried?]

Scope: [What files or features are in scope? What is out of scope?]

Acceptance: [How will you know success? What must be true?]

Return: [What format should the output be in? What should the agent summarize?]
```

Example:
```typescript
Agent({
  description: "Refactor auth",
  prompt: `Goal: Move authentication logic from auth.ts to auth/index.ts and auth/providers.ts.

Context: We discovered that auth.ts has grown to 800 lines and is hard to maintain. Explore findings show it mixes provider login, session management, and token refresh.

Scope: Only src/auth.ts and its callers. Do not refactor test files or migrations. Keep the public API stable.

Acceptance: All tests pass. Imports still resolve correctly. No new dependencies.

Return: Summary of what you moved where, any API changes (if unavoidable), and a link to the PR or diff.`,
})
```

### Skill References: Cite, Don't Parameter

Instead of a separate "skills" or "context" parameter, cite the files and documents your agent needs inline in the brief:

```typescript
Agent({
  subagent_type: "Plan",
  description: "Plan refactor",
  prompt: `Design a refactoring plan based on these findings:\n\n${exploreOutput}\n\nAlso review ARCHITECTURE.md for patterns and MIGRATION_GUIDE.md for any deprecations.`,
})
```

This keeps briefs self-contained and explicit about dependencies.

---

## Bundled Agent Types

pi-subagents ships with seven built-in agent types, covering common workflow patterns. All inherit the parent's model by default (except Explore, which is locked to haiku).

### general-purpose

**Role:** Parent twin — acts as an extension of the parent session.

**Tools:** All 7 (read, bash, edit, write, grep, find, ls)  
**Model:** Inherit parent  
**Thinking:** Inherit parent  
**Prompt:** Appended to parent prompt (inherits CLAUDE.md, AGENTS.md, project context)  
**Max turns:** Unlimited  
**Use when:** You want an agent that follows the same rules as the parent (same conventions, CLAUDE.md, etc.) but in an isolated session.

### Explore

**Role:** Fast codebase navigator — read-only reconnaissance.

**Tools:** read, bash, grep, find, ls (read-only)  
**Model:** haiku (locked, fallback to parent if unavailable)  
**Thinking:** Inherit parent  
**Prompt:** Standalone (read-only system prompt)  
**Max turns:** Unlimited  
**Use when:** You need fast, targeted file searches, code navigation, or reconnaissance without spending tokens on a heavier model. Explore is aggressively read-only — no edit/write/bash-with-redirection.

### Plan

**Role:** Software architect — design implementation strategy (read-only).

**Tools:** read, bash, grep, find, ls (read-only)  
**Model:** Inherit parent (locked)  
**Thinking:** Inherit parent  
**Prompt:** Standalone (architecture/planning system prompt)  
**Max turns:** Unlimited (but typically < 10)  
**Use when:** After exploration, you need a detailed, evidenced implementation plan. Plan reads the Explore findings and produces a structured strategy without modifying anything. Parallelizable into independent chunks via a `parallel-dispatch` block.

### worker

**Role:** Implementation executor — writes code, handles approved tasks.

**Tools:** All 7 (read, bash, edit, write, grep, find, ls)  
**Model:** Inherit parent  
**Thinking:** medium  
**Prompt:** Standalone (implementation system prompt with best practices)  
**Max turns:** Unlimited  
**Features:** Does not fork parent context (isolated session), recovers on abort (graceful resumption)  
**Use when:** Executing a concrete task — refactoring, adding features, fixing bugs. Worker is the single writer thread.

### reviewer

**Role:** Code review specialist — validates diffs, plans, and changes.

**Tools:** All 7 (read-only in practice via system prompt)  
**Model:** Inherit parent  
**Thinking:** Inherit parent  
**Prompt:** Standalone (review-focused system prompt)  
**Max turns:** 30  
**Use when:** After implementation, you need to verify correctness, check for regressions, validate plans against requirements. Reviewer inspects diffs, suggests fixes, and identifies issues.

### oracle

**Role:** Decision-consistency advisor — catches drift, maintains architectural coherence.

**Tools:** read, bash, grep, find, ls (read-only)  
**Model:** Inherit parent  
**Thinking:** medium  
**Prompt:** Standalone (decision-consistency system prompt)  
**Max turns:** 30  
**Features:** Does not fork parent context (isolated session)  
**Use when:** Before a risky decision, you want to check the current plan against inherited constraints, assumptions, and prior decisions. Oracle prevents silent drift.

### orchestrator

**Role:** Active supervision: dispatch with complete briefs, monitor, steer, review, iterate.

**Tools:** bash only  
**Model:** anthropic/claude-fable-5 (fixed)  
**Thinking:** low  
**Prompt:** Standalone (active supervision system prompt)  
**Max turns:** 40  
**Features:** No file modification tools. Dispatches all work to specialized subagents (Explore, worker, reviewer, etc.). Monitors via `get_subagent_result()`. Steers drift with `steer_subagent()`. Reviews work via reviewer dispatch (not direct inspection). Does not inspect code itself; all facts come from subagent reports.  
**Active supervision loop:** (1) Dispatch with complete briefs and expectations, (2) Monitor progress via periodic status checks, (3) Steer blockers or misunderstandings, (4) Review results via reviewer dispatch, (5) Iterate with follow-up workers. Never fire-and-forget.  
**Use when:** Orchestrating complex multi-step workflows with many independent units. Orchestrator plans, dispatches, oversees, and reviews via subagents, never doing direct work.

**Comparison table:**

| Type              | Tools           | Model           | Locked | Depth | Context | Max turns | Use                                |
| ----------------- | --------------- | --------------- | ------ | ----- | ------- | --------- | ---------------------------------- |
| general-purpose   | All 7           | Inherit parent  | No     | 1     | Parent  | —         | Parent twin — same rules           |
| Explore           | Read-only (5)   | haiku / inherit | Yes    | 2     | No      | —         | Fast reconnaissance                |
| Plan              | Read-only (5)   | Inherit parent  | Yes    | 2     | No      | —         | Architecture & implementation plan |
| worker            | All 7           | Inherit parent  | No     | 2     | No      | —         | Code implementation                |
| reviewer          | All 7 (ro)      | Inherit parent  | No     | 1     | No      | 30        | Code review & validation           |
| oracle            | Read-only (5)   | Inherit parent  | No     | 1     | No      | 30        | Decision consistency advisor       |
| orchestrator      | bash only       | claude-fable-5  | Yes    | 1     | No      | 40        | Active supervision & orchestration  |

**Managing defaults:**

- **Eject:** Export a default agent as a `.md` file for customization (`/agents` → select agent → Eject).
- **Override:** Create a `.pi/agents/<name>.md` file with the same name (e.g., `.pi/agents/Explore.md`) to replace it.
- **Disable:** Set `enabled: false` in frontmatter or via `/agents` → select agent → Disable.

---

## Custom Agents

Define custom agent types by creating `.md` files in one of two locations:

| Priority | Location                                       | Scope                  |
| -------- | ---------------------------------------------- | ---------------------- |
| 1        | `.pi/agents/<name>.md`                         | Project (per-repo)     |
| 2        | `$PI_CODING_AGENT_DIR/agents/<name>.md`        | Global (all repos)     |
|          | (default: `~/.pi/agent/agents/<name>.md`)      |                        |

Project agents override global ones with the same name. Any name is allowed — names matching defaults (e.g., `Explore`) will override them.

### Example: `.pi/agents/security-auditor.md`

```markdown
---
description: Security code reviewer for vulnerabilities
display_name: "🔒 Auditor"
tools: read, grep, find, bash
model: anthropic/claude-opus-4-6
thinking: high
max_turns: 45
disallowed_tools: write, edit
---

You are a disciplined security auditor. Review code for:

- SQL injection, command injection, XSS
- Authentication / authorization flaws
- Sensitive data exposure
- Insecure deserialization
- Weak cryptography

Report findings by file:line, severity level (critical/high/medium), and remediation.
```

Then spawn it normally:

```typescript
Agent({
  subagent_type: "security-auditor",
  description: "Audit auth module",
  prompt: "Review src/auth/*.ts for vulnerabilities",
})
```

### Frontmatter Fields

All fields are optional. Sensible defaults apply to everything.

| Field                | Type                    | Default        | Description                                                                                                                                           |
| -------------------- | ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`        | string                  | filename       | Agent description (shown in type lists, `/agents` menu)                                                                                               |
| `display_name`       | string                  | —              | Custom display name for UI (widget, agent list, agent-mode commands)                                                                                 |
| `tools`              | string (comma-separated) | all 7          | Tools this agent can access. Built-in: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`. `none` for no tools. `*` / `all` expands to all built-ins. `ext:foo` / `ext:foo/bar` for extension tools. `ext:*` for all extension tools. |
| `extensions` / `inherit_extensions` | boolean \| string[] | omitted | Extensions to load: `true` (all), `false` (none), or array of names/paths/package sources. Omitted = use global `defaultExtensions`, then all. Names are case-insensitive. **Package source selectors** (e.g., `npm:@scope/package`, `git:https://github.com/org/repo.git`) match exact package sources; supported prefixes: `npm:`, `git:`, `github:`, `http:`, `https:`, `ssh:`. Both field names accepted (alias). |
| `skills` / `inherit_skills` | boolean \| string[] | true | Inherit parent skills (`true`), no skills (`false`), or list specific skill names to preload from `.pi/skills/`. Both names accepted (alias). |
| `disallowed_tools`   | string (comma-separated) | —              | Tools to deny even if extensions provide them (e.g., `write, edit`)                                                                                   |
| `memory`             | `project` \| `local` \| `user` | —              | Persistent memory scope. Auto-detects read-only agents for safety (read-only memory mode).                                                          |
| `isolation`          | `worktree`              | —              | Run in isolated git worktree (safe concurrent edits, branches auto-created)                                                                           |
| `model`              | string                  | inherit parent | Model ID or fuzzy name (`"anthropic/claude-opus"`, `"haiku"`, `"sonnet"`)                                                                            |
| `lock_model`         | boolean                 | false          | If true, refuse parent `model` param overrides. Use when agent design requires a specific model.                                                    |
| `thinking`           | string                  | inherit        | Extended thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`                                                                         |
| `max_turns`          | number                  | unlimited      | Max turns before graceful wrap-up. `0` or omitted = unlimited. Surfaced in tool type list for caller budgeting.                                    |
| `prompt_mode`        | `append` \| `replace`   | `replace`      | `replace`: body is full system prompt. `append`: body appended to parent prompt (parent twin).                                                      |
| `inherit_context`    | boolean                 | false          | Fork parent conversation into agent (agent sees thread so far). Surfaced in type list.                                                             |
| `run_in_background`  | boolean                 | true           | Default to background mode (no blocking)                                                                                                            |
| `enabled`            | boolean                 | true           | Set `false` to disable. Disabled agents stay visible in `/agents` but cannot be spawned, scheduled, or used in nested work.                         |
| `recover_on_abort`   | boolean                 | false          | If true, graceful wrap-up (via steering) is attempted before hard abort. Worker agents default to true.                                            |

The body (everything after the `---` frontmatter block) becomes the agent's system prompt. If `prompt_mode: append`, it is appended to the parent's prompt (parent twin behavior). If `prompt_mode: replace`, it is the full prompt.

### Extension Selector Example

Use package source selectors to limit extensions by their installation source:

```markdown
---
description: GitHub-only code search agent
extensions:
  - npm:@scope/package
  - git:https://github.com/org/repo.git
tools: read, grep, ext:github/search
---

You can use the GitHub search tool and read files.
```

**State precedence:**
1. Agent frontmatter `extensions:` list (if specified)
2. Global `defaultExtensions` setting (if omitted)
3. All discovered extensions (if both omitted)

Package source selectors match exact sources; use `npm:`, `git:`, `github:`, `http:`, `https:`, or `ssh:` prefix. Names and paths (with `/` or `~`) are also supported in the same array.

### System Prompt Guidelines

- **Replace mode** (default): Write a complete, standalone prompt. The agent does not see CLAUDE.md or parent conventions.
- **Append mode**: Write a brief addition that extends the parent's prompt. Useful for specialized sub-agents that should follow the parent's rules.
- **Read-only agents**: Use the standalone system prompt to forbid writes (copy from Explore or Plan for reference).

---

## UI & Commands

### Live Widget

pi-subagents displays a persistent above-editor widget showing all active agents:

```
● Agents
├─ ⠹ worker  Refactor auth module · ⟳5≤30 · 5 tool uses · 33.8k token (62%) · 12.3s
│    ⎿  editing auth.ts…
├─ ⠹ Explore  Find auth files · ⟳3 · 3 tool uses · 12.4k token (8%) · 4.1s
│    ⎿  searching…
└─ 2 queued
```

**Widget elements:**

- **Spinner:** Animates while running. Icon (✓/✗/■) on completion.
- **Name:** Agent type and description.
- **Config tag:** Model and thinking level (if non-default).
- **Turns:** `⟳5≤30` (5 turns, max 30). `≤30` omitted if unlimited.
- **Tool uses:** Count of tool executions so far.
- **Tokens:** Lifetime token usage. `(NN%)` shows context-window utilization (color-coded: <70% dim, 70–85% warning, ≥85% error). `↻N` shows compaction count.
- **Duration:** Elapsed time (appears after completion).
- **Activity:** Current action (searching, reading, editing, etc.).

**Modes:**

- **Cards (default):** Colored grid layout, flat list.
- **Tree:** Hierarchical (when agents spawn subagents). Toggle with `/agents-view`.

**Nested agents:**

```
● Agents
├─ ⠙ worker  refactor auth · ⟳5 · 5 tool uses · 23s
│    ⎿  spawning subagents…
│    ├─ ⠹ Explore  map call sites · ⟳2 · 2 tool uses · 6s
│    │    ⎿  searching…
│    └─ ✓ reviewer  validate migration · 8 tool uses · 11s
│         ⎿  Done
└─ ⠋ general-purpose  write changelog · ⟳1 · 2 tool uses · 9s
     ⎿  thinking…
```

### /agents Command

Open an interactive menu for agent management:

```
Running agents (2) — 1 running, 1 done
├─ Agent types (6)
├─ Create new agent
└─ Settings
```

**Agent types:**

Unified list with source indicators:

- `•` = project agent (`.pi/agents/<name>.md`)
- `◦` = global agent (`~/.pi/agent/agents/<name>.md`)
- `✕` = disabled agent

**Select an agent to:**

- **View conversation** — open live-scrolling overlay of full agent transcript
- **Eject** (defaults only) — export as `.md` file for customization
- **Edit** — open `.md` file in editor
- **Disable / Enable** — toggle availability
- **Reset to default** (overridden defaults only) — remove custom file, revert to embedded version
- **Delete** — remove custom agent file

**Create new agent:**

- **Manual wizard:** Step-by-step prompts for name, tools, model, thinking, system prompt
- **AI-generated:** Describe what the agent should do; a sub-agent writes the `.md` file

**Settings:**

- `maxConcurrent` (default 4): Max concurrent background agents
- `defaultMaxTurns` (default unlimited): Default max turns before graceful wrap-up
- `graceTurns` (default 8): Extra turns allowed after wrap-up warning
- `defaultJoinMode` (default `smart`): Notification strategy for background completions (`async`, `group`, `smart`)
- `schedulingEnabled` (default true): Master switch for `/Agent.schedule` parameter
- `disableDefaultAgents` (default false): Skip all bundled agents (general-purpose, Explore, Plan, worker, reviewer, oracle, orchestrator)
- `toolDescriptionMode` (default `compact`): LLM description of Agent tool (`full`, `compact`, `custom`)
- `defaultExtensions` (default all): Default extension allowlist for agents that omit `extensions:`

### Prompt Templates

Four bundled slash commands drive ready-made workflows. All use the **coordinator pattern**: dispatch agents, read results, synthesize, write the next prompt.

| Command            | When to use                               | Flow                                       |
| ------------------ | ----------------------------------------- | ------------------------------------------ |
| `/feature <task>`  | Normal feature work (default)             | scout → plan → implement → review → fix   |
| `/feature-light <task>` | Small, well-scoped change                 | implement → review → fix                   |
| `/execute-plan <plan>` | Run an existing plan (no scout/plan step) | implement (parallel) → review → fix        |
| `/orchestrate <list>` | Multiple independent features in one chat | parallel orchestrators, each self-managing |

**Scout (Explore in parallel):**

When reconnaissance splits into separable domains (e.g., frontend & backend), scouts run concurrently in one message:

```typescript
Agent({ subagent_type: "Explore", description: "Frontend auth", ..., run_in_background: true })
Agent({ subagent_type: "Explore", description: "Backend auth", ..., run_in_background: true })
```

Coordinator reads both results before moving to planning.

**Plan (single agent, structured output):**

Plan agent produces a design document with a `parallel-dispatch` block (JSON) listing independent chunks:

```json
[
  { "subagent_type": "worker", "prompt": "Implement chunk 1", "files": [...] },
  { "subagent_type": "worker", "prompt": "Implement chunk 2", "files": [...] }
]
```

**Implementation (parallel workers):**

Coordinator launches workers in one message with disjoint `files:` declarations:

```typescript
Agent({ subagent_type: "worker", description: "Implement chunk 1", files: [...], run_in_background: true })
Agent({ subagent_type: "worker", description: "Implement chunk 2", files: [...], run_in_background: true })
```

**Review & fix:**

Reviewer inspects the combined diff and suggests fixes. Coordinator dispatches fix worker if needed. Typically one loop.

**Customization:**

Copy a template into `~/.pi/agent/prompts/` (global) or `.pi/agent/prompts/` (project) and edit. Project templates override bundled ones.

---

## Features

### Parallel Background Agents

Launch multiple independent agents in a single message with `run_in_background: true`. They run concurrently up to `maxConcurrent` (default 4); excess agents queue automatically.

```typescript
// All three launch immediately and run concurrently
Agent({
  subagent_type: "Explore",
  description: "Scout A",
  prompt: "...",
  run_in_background: true,
})

Agent({
  subagent_type: "Explore",
  description: "Scout B",
  prompt: "...",
  run_in_background: true,
})

Agent({
  subagent_type: "Explore",
  description: "Scout C",
  prompt: "...",
  run_in_background: true,
})
```

**Key rules:**

- **Single message:** Launch all agents in ONE message (multiple tool calls). Separate messages prevent true parallelism.
- **File ownership:** Declare `files: [...]` for each agent to prevent collisions. Disjoint sets suppress warnings.
- **Independent work:** Agents don't wait for each other. The coordinator reads results asynchronously via `get_subagent_result`.
- **Queueing:** Automatic — excess agents wait behind running ones. Widget shows queued count.

**Join mode** (notification strategy):

| Mode    | Behavior                                                                  |
| ------- | ------------------------------------------------------------------------- |
| `smart` | 2+ agents from same turn auto-group; solo agents notify individually     |
| `async` | Each agent sends its own notification on completion                       |
| `group` | Force grouping even for a single agent                                   |

**Timing (smart & group modes):**

When grouping is active, the first agent in a group to complete starts a **30-second wait**. On timeout, a partial notification is sent with the completed agents, and remaining agents are moved to a **straggler batch** with a shorter **15-second window**. This ensures quick feedback on partial progress while still batching late arrivals efficiently.

Configure via `/agents` → Settings → Join mode.

### Nested Subagents

A subagent can spawn its own subagents, up to a fixed depth (default 2):

```
Real session (depth 0)
  ├─ worker (depth 1)        [has spawning tools]
  │   ├─ Explore (depth 2)    [has spawning tools]
  │   └─ reviewer (depth 2)   [has spawning tools]
  └─ general-purpose (depth 1) [has spawning tools]
      └─ (no spawning tools at depth 3)
```

**Depth cap:** Agents only receive `Agent`, `get_subagent_result`, and `steer_subagent` tools if they sit below the cap. Depth-2 agents cannot spawn further.

**Display:** Grandchildren appear indented under their parent in tree-view mode (`/agents-view` to toggle).

**Use when:** A worker naturally delegates reconnaissance (`Explore`) or review (`reviewer`). Flat parallelism is usually better for known-upfront work.

### Scheduling

Pass `schedule` to the `Agent` tool to fire later instead of now:

```typescript
Agent({
  subagent_type: "Explore",
  description: "Weekly review",
  prompt: "Summarize changes since last week",
  schedule: "0 0 9 * * 1",  // 9am every Monday (6-field cron)
})
```

**Formats:**

- **Cron** — 6-field (`second minute hour day-of-month month day-of-week`). E.g., `"0 0 9 * * 1"` (9am Mondays), `"0 */15 * * * *"` (every 15 minutes).
- **Interval** — `"5m"`, `"1h"`, `"30s"`, `"2d"`. Fires repeatedly at that interval.
- **One-shot relative** — `"+10m"`, `"+2h"`, `"+1d"`. Fires once at that future time.
- **One-shot absolute** — ISO timestamp, e.g., `"2026-12-25T09:00:00.000Z"`.

**Behavior:**

- Scheduled fire runs in background (`run_in_background: true` forced).
- Results arrive via the same `subagent-notification` path as manual background completions.
- Schedules are **session-scoped**: reset on `/new`, restore on `/resume`.
- Bypass the `maxConcurrent` queue — a 5-minute interval cannot be deferred.
- Managed via `/agents` → Scheduled jobs (view, cancel, re-run).

**Restrictions:**

- `schedule` cannot combine with `inherit_context` (no parent at fire time) or `resume` (fresh agents only).
- Headless `pi -p` does not wait for scheduled subagents.

**Disable entirely:** `/agents` → Settings → Scheduling → disabled removes the `schedule` param from the Agent tool spec (no LLM-context cost) and stops any active scheduler.

### Agent Mode

Switch the current session into a brand-new session configured as a selected agent. Useful for **interactive testing**, **perspective shifts**, and **hands-on agent exploration** without using the `Agent()` tool.

**Summary:**

| Aspect | Detail |
| --- | --- |
| **What** | Creates a fresh session with the agent's system prompt, model, tools, thinking level, and preloaded skills. |
| **How** | `/agent-mode <name>` (or type `@@` for autocomplete picker), then type directly into the new session. |
| **Return** | `/agent-mode-off` restores the exact previous session via breadcrumb. |
| **Context** | Not auto-copied — you hand off manually as your first message in the new session. |
| **Model / tools / thinking** | Inherited from the agent config, applied on session entry. |
| **Persistence** | No cleanup — sessions remain in thread history; you manage switching. |

**Commands:**

| Command | Effect |
| --- | --- |
| `/agent-mode <name>` | Switch to a fresh session configured as `<name>` (e.g., `Explore`, `reviewer`, custom agent). |
| `@@<name>` | **Autocomplete picker** — type `@@` to see all available agent types + `@@main`. Selecting an item inserts the real `/agent-mode <name>` text (does NOT auto-submit). Press Enter to dispatch. |
| `@@main` | Quick alias for `/agent-mode-off`. |
| `/agent-mode-off` | Return to the previous session (breadcrumb widget). |

**What gets applied (fresh session setup):**

- **System prompt** — Full agent prompt including preloaded skills (if any).
- **Model** — Inherited from agent config (e.g., haiku for Explore, parent model for worker).
- **Tools** — Agent's core tools (built-ins); all extension tools included unless extensions disabled, minus any disallowed tools.
- **Thinking level** — Inherited from agent config (e.g., medium for worker, inherit for Explore).
- **Status indicator** — Live "Agent: <name>" status tag in the new session header.

**Context & Breadcrumb:**

- **No auto-copy** — Parent conversation is **not** inherited. You manage handoff yourself:
  - Confirm dialog reminds: *"This starts a brand-new session configured as <agent>. Nothing carries over automatically — if there's anything to hand off, say so as your first message once switched."*
  - Copy/paste summary manually if needed, or hand off via chat.
- **Breadcrumb widget** — Persistent, read-only widget in the new session shows:
  - Previous session ID
  - First user message from that session (truncated)
  - Last agent reply from that session (truncated)
  - "/agent-mode-off to return" hint
- **Auto-clearing** — Breadcrumb disappears after your first prompt in the new session.

**Use cases:**

1. **Review code as reviewer:** Test reviewer's perspective on a diff.
   ```
   /agent-mode reviewer
   > [copy/paste the diff]
   > [review as the reviewer agent]
   /agent-mode-off
   > [back to main]
   ```

2. **Explore as Explore:** Quick read-only navigation with haiku model.
   ```
   /agent-mode Explore
   > Search for auth handlers
   /agent-mode-off
   ```

3. **Validate with oracle:** Test decision consistency interactively.
   ```
   /agent-mode oracle
   > Does this refactoring contradict the plan we discussed earlier?
   /agent-mode-off
   ```

4. **Custom agent testing:** Validate a new `.pi/agents/my-auditor.md` before using it in production.
   ```
   /agent-mode my-auditor
   > [test its behavior directly]
   ```

**Technical notes:**

- **Session isolation** — New session created via `newSession({ parentSession })` and switched to immediately, **not a nested subagent call**. No `Agent()` tool invocation required.
- **No nesting restriction** — Agent-mode is independent; nesting limits (depth cap) do not apply.
- **No parent context edge case** — Unlike `inherit_context: true` in `Agent()`, agent-mode never auto-forks the parent conversation. Full control remains with you.
- **Extension tooling** — Extension instance is fresh for the new session; tool visibility is computed before the session switch based on current extensions (no auto-reload of extension code, but tool list is current).

### Worktree Isolation

Run an agent in an isolated git worktree so concurrent edits never collide:

```typescript
Agent({
  subagent_type: "worker",
  description: "Refactor auth",
  prompt: "...",
  isolation: "worktree",
  run_in_background: true,
})
```

**Behavior:**

- Creates a temporary git worktree (isolated copy of the repo).
- Agent's `cwd` redirects to the worktree (relative paths resolve inside it).
- On completion:
  - **No changes:** Worktree cleaned up automatically.
  - **Changes made:** Committed to a new branch. Branch name returned in result.

**Branch naming and collisions:**

- Default branch name: `pi-agent-<id>`
- If branch already exists (e.g., from a previous agent with the same ID), collision is handled by appending a timestamp: `pi-agent-<id>-<timestamp>`
- Existing branches are never overwritten; the timestamp ensures uniqueness.

**Limitations:**

- Only affects **relative** path resolution. Absolute paths (e.g., `/home/user/repo/file.ts`) resolve against the real filesystem.
- Not a security sandbox — a deliberately-constructed absolute path can still write to the main tree.
- Convention against accidental collisions, not filesystem isolation.

**Failure:** If the worktree cannot be created (not a git repo, no commits, `git worktree` fails), Agent returns a clear error instead of falling back to an unisolated run — `isolation: "worktree"` is a strict guarantee.

### Context Inheritance

Fork the parent conversation into a subagent so it sees the thread so far:

```typescript
Agent({
  subagent_type: "oracle",
  description: "Validate decision",
  prompt: "Review the plan above and flag any drift against inherited decisions",
  inherit_context: true,
})
```

**Behavior:**

- Agent receives a copy of all prior messages in the current conversation.
- Useful for high-context reviews (oracle), decision validation, and consistency checks.
- Adds context-window cost — only use when the agent needs the full thread.

**Not recommended:**

- `Explore` (fast, read-only; context is wasted)
- Scheduled jobs (no parent context exists at fire time; results in an error)

### Persistent Agent Memory

Agents can retain state across sessions via persistent memory directories:

```markdown
---
memory: project
---

Your system prompt. You have access to MEMORY.md in .pi/agent-memory/my-agent/.
```

**Scopes:**

| Scope     | Location                         | Use case                 | Share                  |
| --------- | -------------------------------- | ------------------------ | ---------------------- |
| `project` | `.pi/agent-memory/<name>/`       | Team-shared memory       | Committed (git)        |
| `local`   | `.pi/agent-memory-local/<name>/` | Machine-specific state   | Local (git-ignored)    |
| `user`    | `~/.pi/agent-memory/<name>/`     | Global personal memory   | Your machine only       |

**Structure:**

Memory uses a `MEMORY.md` index (max 200 lines) plus individual memory files with YAML frontmatter:

```markdown
---
name: <memory-name>
description: <one-line description>
type: <user|feedback|project|reference>
---
<memory content>
```

**Write capability:**

- **Agents with write tools** (read, edit, write): Full read-write access.
- **Read-only agents** (no write/edit): Automatic read-only mode — can read but not modify memory.

This prevents tool escalation: an agent without write access cannot circumvent the restriction via memory.

**Agent initialization:**

On spawn, the agent's system prompt is injected with a memory-loading block (if the agent has `memory` set). The agent can read from MEMORY.md and individual files, update them, or create new ones.

### Graceful Max Turns

Instead of hard-aborting at the turn limit, agents get a graceful shutdown:

1. **At max_turns** — steering message: _"Wrap up immediately — provide your final answer now."_
2. **Grace period** — up to `graceTurns` (default 8) extra turns to finish cleanly.
3. **Hard abort** — if grace period exceeds, agent stops with `aborted` status.

**Status labels:**

| Status       | Meaning                       | Icon       |
| ------------ | ----------------------------- | ---------- |
| `completed`  | Finished naturally            | ✓ (green)  |
| `steered`    | Hit limit, wrapped up in time | ✓ (yellow) |
| `aborted`    | Grace exceeded                | ✗ (red)    |
| `stopped`    | User-initiated abort          | ■ (dim)    |

**Configure:** `/agents` → Settings → Grace turns.

### Recovery on Abort

When a foreground agent hits the hard abort limit, it can attempt recovery instead of losing all work. Recovery is enabled by setting `recover_on_abort: true` in agent frontmatter (the `worker` agent defaults to `true`). **Note:** Recovery is wired for foreground Agent calls only, not background agents.

**How it works:**

Recovery uses a multi-checkpoint protocol and fallback strategy:

1. **Checkpoint protocol appended**: When recovery is enabled, every prompt is augmented with a checkpoint protocol block:
   ```
   After each file edit, log progress with write_output (append: true):
     ✓ DONE: <path>

   Before stopping (whether done or not), end your final message with:
   ## Recovery Checkpoint
   DONE: <completed paths, one per line>
   IN_PROGRESS: <current file and what remains>
   TODO: <not yet started>
   ```
   This teaches the agent to log progress and emit a structured checkpoint.

2. **Soft-limit steering**: At `max_turns`, a steering message is injected:
   ```
   You are running out of turns. STOP current work immediately.
   Write your ## Recovery Checkpoint section NOW (DONE / IN_PROGRESS / TODO).
   Then provide your final answer.
   ```
   This gives the agent a chance to write its checkpoint before the hard abort.

3. **Resume attempt (input ≤ 150,000 tokens)**: If the agent aborts despite steering, and the session is still alive with **lifetime input tokens ≤ 150,000**, pi-subagents attempts to resume the session with a continuation prompt:
   ```
   You were aborted before finishing.

   [Your last output including the checkpoint]

   Continue from where you left off.
   ```
   This preserves the full conversation history and is the cheapest recovery method. If resume fails, recovery proceeds to the next step.

4. **Fresh-spawn fallback**: If live resume is not available or skipped (context pressure exceeded), a new agent is spawned with:
   - Original prompt
   - Extracted checkpoint (if available)
   - `git diff HEAD` (staged/unstaged changes)
   - `git status --short` (untracked files)
   
   This gives the new agent full visibility into what was attempted and what changed.

**Retry behavior:** Recovery proceeds through the steps above. The final agent status may be `error`, `aborted`, or `success`.

**Configure:** Set `recover_on_abort: true` in `.pi/agents/<name>.md` frontmatter only. This is a per-agent setting; there is no global on/off switch via `/agents` Settings.

### Skill Preloading

Inject named skill files into an agent's system prompt:

```markdown
---
skills: api-conventions, error-handling, logging
---

Your system prompt. The skills "api-conventions", "error-handling", and "logging"
have been injected above this paragraph.
```

**Discovery (precedence order):**

1. `<cwd>/.pi/skills/` (project, Pi standard)
2. `<cwd>/.agents/skills/` (project, cross-tool Agent Skills spec)
3. `$PI_CODING_AGENT_DIR/skills/` (global, default `~/.pi/agent/skills/`)
4. `~/.agents/skills/` (user, cross-tool Agent Skills spec)
5. `~/.pi/skills/` (legacy global)

**File layout (per root):**

- Flat: `<root>/<name>.md` (or `.txt`, extensionless)
- Directory: `<root>/<name>/SKILL.md` (allows nested subdirectories; Pi standard)

A skill resolver stops at the first match. Symlinks are rejected for security.

**Use case:** Reuse custom guidelines across multiple agents without duplicating text.

### Tool Denylist

Deny specific tools from an agent even if extensions provide them:

```markdown
---
tools: read, bash, grep, write
disallowed_tools: write
---

You have access to read, bash, grep, but NOT write (blocked).
```

**Use case:** Create agents that inherit extension tools but should not have write access (e.g., audit agents that search but don't modify).

### Grind Counter

Session-local telemetry that notices long runs of inline tool calls in the main agent. Nudges you to delegate when streaks get long.

**Thresholds:**

- **Inline tools:** 25+ consecutive tool calls in the main session (search, read, grep, etc.) without spawning an agent → delegates to `Explore`
- **Bash debugging:** 12+ consecutive bash executions without spawning an agent → suggests `worker` for the underlying task

**Behavior:**

- Counter resets when you spawn an Agent (any type).
- Cooldown: 25 calls shared between nudge types (avoid spam).
- No persistence — resets on session `/new`.
- Only observes the main session (not subagents).
- **Neutral tools:** `get_subagent_result` and `steer_subagent` do not advance the inline streak and reset the bash streak (these are subagent-specific meta-calls, not work).

**Settings note:** Thresholds are constructed with in-code defaults (25 inline, 12 bash) and are not persisted as user-configurable settings. Nudges are feedback only — ignore or embrace based on your workflow.

**View current state:** `/grind-status`

**Philosophy:** Nudge toward delegation, not hard enforcement. Nudges are subtle (a short message placed in context after the next tool result). Ignore them if you prefer inline tools.

### Cross-Extension RPC

Other pi extensions can spawn and stop subagents programmatically via `pi.events` without importing pi-subagents directly.

**Discovery:**

Listen for `subagents:ready` to know when RPC handlers are registered:

```typescript
pi.events.on("subagents:ready", () => {
  // safe to call RPC
});
```

**Ping (check availability):**

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:ping:reply:${requestId}`, (reply) => {
  unsub();
  if (reply.success) {
    console.log("Protocol version:", reply.data.version); // version 2
    console.log("Ready to spawn agents");
  }
});
pi.events.emit("subagents:rpc:ping", { requestId });
```

**RPC protocol:** Version 2. The protocol contract (envelope shape, method signatures) is stable; bumped only on breaking changes.

**Spawn:**

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:spawn:reply:${requestId}`, (reply) => {
  unsub();
  if (reply.success) console.log("Agent ID:", reply.data.id);
  else console.error("Failed:", reply.error);
});
pi.events.emit("subagents:rpc:spawn", {
  requestId,
  type: "Explore",
  prompt: "Find X",
  options: { description: "My task", run_in_background: true },
});
```

**Stop:**

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:stop:reply:${requestId}`, (reply) => {
  unsub();
  if (!reply.success) console.error("Failed:", reply.error);
});
pi.events.emit("subagents:rpc:stop", { requestId, agentId: "agent-id" });
```

**Reply envelope:**

All RPC replies use a standardized shape:

```typescript
{ success: true, data?: T }     // Success
{ success: false, error: string }  // Failure
```

**Same-process integration:**

For extensions loaded in the same pi process, pi-subagents exposes manager APIs via Symbol-keyed globals (Node.js pattern for cross-package singletons):

```typescript
// Access the manager from another extension:
const MANAGER_KEY = Symbol.for("pi-subagents:manager");
const manager = (globalThis as any)[MANAGER_KEY];

if (manager) {
  manager.spawn(pi, ctx, "Explore", "Find X", { description: "Task" });
  manager.getRecord(agentId); // get current state
  manager.hasRunning();        // check if agents active
  manager.waitForAll();        // block until all complete
}
```

Also available: `Symbol.for("pi-subagents:registry")` for nested display (read-only activity graph).

**Note:** The event RPC is the public contract (stable across pi versions). Symbols are same-process integration convenience — do not rely on them for cross-extension communication that spans process boundaries.

### Events

Agent lifecycle events are emitted via `pi.events` for other extensions to consume:

| Event                   | When                                                   | Key fields                                       |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `subagents:ready`       | Extension loaded, RPC handlers registered              | —                                                |
| `subagents:created`     | Background agent registered                            | `id`, `type`, `description`                      |
| `subagents:started`     | Agent transitions to running (including queued→running) | `id`, `type`, `description`                      |
| `subagents:completed`   | Agent finished successfully                            | `id`, `type`, `result`, `status`, `tokens`, `toolUses`, `durationMs` |
| `subagents:failed`      | Agent errored, stopped, or aborted                     | (same as `completed`) + `error`, `status`        |
| `subagents:steered`     | Steering message sent                                  | `id`, `message`                                  |
| `subagents:compacted`   | Agent session successfully compacted                   | `id`, `reason` (`manual`/`threshold`/`overflow`), `tokensBefore`, `compactionCount` |
| `subagents:scheduled`   | Schedule lifecycle event (added/removed/updated/fired) | `{ type: "added" \| ... , jobId, ... }`          |
| `subagents:scheduler_ready` | Scheduler bound to session, enabled jobs armed         | `sessionId`, `jobCount`                          |
| `subagents:settings_loaded` | Persisted settings applied at init                     | `settings` (merged global + project)             |
| `subagents:settings_changed` | Runtime settings mutation applied                      | `settings`, `persisted` (write success)          |

### pi-intercom Bridge

When **pi-intercom** is installed, **background child agents** automatically get a `contact_supervisor` tool that routes messages back to their immediate parent. Foreground child agents skip this bridge and load extensions normally. This is a zero-config bridge — no manual setup required.

**How it works:**

- When pi-subagents spawns a background child, it sets `PI_SUBAGENT_*` environment variables (metadata: orchestrator session ID, child agent name, run index, etc.).
- The child's intercom extension, on startup, detects these env vars and registers a `contact_supervisor` tool routed back to the orchestrator.
- Messages sent via `contact_supervisor` are delivered to the parent's session (visible in parent conversation or callbacks).
- **Foreground children:** Do not receive the bridge env vars and skip this tool setup entirely.
- **Nested agents:** Each spawner's orchestrator ID is its own `ctx` session ID, so grandchildren route to their direct parent (worker), not the top session.
- **Extension availability:** pi-intercom must survive the agent's extension filtering to be available. If the child's manifest excludes it, the tool will not be registered.
- **Graceful fallback:** If pi-intercom is not installed, the env vars are inert — no error, no tool, completely invisible.

**Use case:** Let background child agents ask questions or escalate decisions without waiting for the parent to poll results. Especially useful in `orchestrator` agents that delegate work and want live feedback.

### Output Transcripts

Agent conversations are automatically transcribed to output files in a temporary directory:

| Default location                                          | Scope    | Example                        |
| --------------------------------------------------------- | -------- | ------------------------------ |
| `/tmp/pi-subagents-{uid}/{encoded-cwd}/{sessionId}/tasks/{agentId}.output` | Temporary  | `/tmp/pi-subagents-1000/home-user-project/sess123/tasks/agent-abc123.output` |

Each line is a JSON object (message, tool call, tool result). Streaming writes — transcript is readable while the agent runs. Completion notifications link to the transcript file.

**Access:** Open via UI (completion notification → "transcript: ...") or via `get_subagent_result({ agent_id: "...", verbose: true })`.

---

## Settings & Configuration

Settings persist across pi sessions and are merged from two sources:

| Level   | Location                                    | Precedence | Written by          |
| ------- | ------------------------------------------- | ---------- | ------------------- |
| Project | `<cwd>/.pi/subagents.json`                  | Higher     | `/agents` → Settings |
| Global  | `$PI_CODING_AGENT_DIR/subagents.json`       | Lower      | Manual edit only     |
|         | (default: `~/.pi/agent/subagents.json`)     |            |                      |

**All settings:**

| Field                   | Type                     | Default  | Description                                                                  |
| ----------------------- | ------------------------ | -------- | ---------------------------------------------------------------------------- |
| `maxConcurrent`         | number                   | 4        | Max concurrent background agents                                             |
| `defaultMaxTurns`       | number                   | 0 (unlimited) | Default max turns before graceful wrap-up. `0` = unlimited.            |
| `graceTurns`            | number                   | 8        | Extra turns allowed after wrap-up warning                                    |
| `defaultJoinMode`       | `"async"` \| `"group"` \| `"smart"` | `"smart"` | Background agent completion notification strategy  |
| `schedulingEnabled`     | boolean                  | true     | Master switch for schedule parameter and scheduler                           |
| `disableDefaultAgents`  | boolean                  | false    | Skip all bundled agents (general-purpose, Explore, Plan, worker, reviewer, oracle, orchestrator)              |
| `toolDescriptionMode`   | `"full"` \| `"compact"` \| `"custom"` | `"compact"` | LLM description of Agent tool                          |
| `defaultExtensions`     | boolean \| string[]      | omitted  | Default extension allowlist for agents that omit `extensions:` field        |

**Example — global defaults for a powerful machine:**

```bash
mkdir -p ~/.pi/agent
cat > ~/.pi/agent/subagents.json <<'EOF'
{
  "maxConcurrent": 16,
  "graceTurns": 10,
  "defaultMaxTurns": 50
}
EOF
```

Every project now starts with concurrency 16, grace 10, and default max-turns 50, without touching the menu. Project settings via `/agents` override these globally.

**Tool description modes:**

- `"compact"` (default): ~75% smaller — one-line type list, terse notes. Better for small/local models.
- `"full"`: Rich Claude Code-style description with full type list, guidelines, and usage notes.
- `"custom"`: User-authored template with `{{placeholder}}` substitution. Resolved from:
  1. `.pi/agent-tool-description.md` (project)
  2. `$PI_CODING_AGENT_DIR/agent-tool-description.md` (global, default `~/.pi/agent/agent-tool-description.md`)
  
  Missing/empty file falls back to `"full"`. Applies next session (requires session `/new` or fresh pi invocation).

**Custom template placeholders:**

- `{{typeList}}` — Full agent type list (compact + full descriptions)
- `{{compactTypeList}}` — Compact one-line agent type list
- `{{guidelines}}`: Deprecated; renders as empty (coordination guidance moved to AGENTS.md)
- `{{agentDir}}` — Path to active agent directory (e.g., `~/.pi/agent`)
- `{{scheduleGuideline}}` — Schedule parameter format documentation

See `examples/agent-tool-description.md` for a complete template example.

**Failure behavior:**

- Missing file: Silent (use defaults).
- Malformed JSON: Warning to stderr; fall back to defaults per-field.
- Invalid field values: Dropped per-field (rest of config applied).
- Write failures: `/agents` → Settings toast downgrades to warning with "(session only; failed to persist)".

---

## Architecture & Development

### Source Structure

```
src/
  index.ts                   # Extension entry, tool/command registration, custom rendering
  types.ts                   # Type definitions (AgentConfig, AgentRecord, etc.)
  default-agents.ts          # Embedded default agent configs
  agent-types.ts             # Unified agent registry (defaults + user)
  agent-runner.ts            # Session creation, execution, graceful max_turns, steer/resume
  agent-manager.ts           # Agent lifecycle, concurrency queue, completion notifications
  global-registry.ts         # Process-global activity registry (nested display)
  cross-extension-rpc.ts     # RPC handlers (spawn/stop/ping via pi.events)
  intercom-bridge.ts         # Optional pi-intercom contact_supervisor bridge
  group-join.ts              # Batched completion notifications with timeout
  custom-agents.ts           # Load user agents from .pi/agents/*.md
  memory.ts                  # Persistent agent memory (resolve, read, load)
  skill-loader.ts            # Preload skill files from .pi/skills/
  output-file.ts             # Streaming output transcripts
  worktree.ts                # Git worktree isolation (create, cleanup)
  prompts.ts                 # System prompt builder (config-driven)
  context.ts                 # Parent conversation for inherit_context
  env.ts                     # Environment detection (git, platform)
  settings.ts                # Settings persistence and loading
  schedule.ts                # Scheduled agent execution (cron/interval)
  schedule-store.ts          # Schedule persistence (PID-locked, session-scoped)
  agent-mode.ts              # Session switching to agent perspective
  ui/
    agent-widget.ts          # Live widget rendering
    schedule-menu.ts         # Scheduled jobs UI
  [... more]
test/
  *.test.ts                  # Vitest tests
```

### Coordinator Pattern (Not Chains)

The architecture deliberately does **not** use chains. Instead, the parent agent orchestrates:

```
1. Parent dispatches Agent() calls (one or more)
2. Parent reads results via `get_subagent_result`
3. Parent synthesizes understanding
4. Parent writes the next prompt (based on synthesis)
5. Repeat (coordinator loop)
```

No hidden retries, no auto-chaining, no opaque branching. Full transparency and control.

### Testing

```bash
npm run test              # Run vitest once
npm run test:watch       # Watch mode
```

Tests use vitest with mocked `ExtensionAPI` types (fakes cast as `any` / `as unknown as`). Patterns:

- Register agents with `registerAgents(new Map())` in `beforeEach` to reset state.
- Mock pi context with minimal ExtensionAPI shape.
- Test agent spawning, queueing, completion, and steering flows.

### Dependencies

**Peer dependencies:**

- `@mariozechner/pi-ai` ≥ 0.70.5
- `@mariozechner/pi-coding-agent` ≥ 0.70.5
- `@mariozechner/pi-tui` ≥ 0.70.5

**Production dependencies:**

- `@sinclair/typebox` — JSON Schema generation for type definitions
- `croner` — Cron job scheduling
- `nanoid` — Unique ID generation

**Dev dependencies:**

- `typescript` — Compilation
- `vitest` — Testing framework
- `@biomejs/biome` — Linting and formatting

---

## License

MIT

---

## Contributing

Contributions welcome. Before submitting a PR, run the test suite and linting:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## See Also

- [pi documentation](https://pi.dev)
- [Claude documentation](https://claude.ai)
- [CHANGELOG](CHANGELOG.md) — Release notes and breaking changes
- [DECISIONS](DECISIONS.md) — Architectural decisions
- [AGENTS](AGENTS.md) — Agent repo orientation
