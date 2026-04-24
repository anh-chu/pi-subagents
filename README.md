# @anh-chu/pi-subagents

A [pi](https://pi.dev) extension that brings **Claude Code-style autonomous sub-agents** to pi. Spawn specialized agents that run in isolated sessions — each with its own tools, system prompt, model, and thinking level. Run them in foreground or background, steer them mid-run, resume completed sessions, and define your own custom agent types.

> **Status:** Early release.
> **Forked from** [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) with significant additions — see below.

## What this adds over `@tintinweb/pi-subagents`

- **Parent↔subagent bridge** — subagents get native `message_parent` and `ask_parent` tools. The parent replies with `reply_to_subagent` and fetches queued payloads with `get_subagent_message`. Messages are session-scoped and queue-first.
- **Session scoping** — agents are bound to the session that spawned them. After `/new` or a session switch, prior-session agents no longer fire notifications into the new session.
- **AGENTS.md / APPEND_SYSTEM.md isolation** — these files are never leaked into subagent prompts, regardless of prompt mode or parent context.
- **Nested subagent prompt hygiene** — stale `<sub_agent_context>` and `<runtime_truth>` blocks are stripped from inherited parent prompts before re-injection, preventing prompt pollution in agent chains.
- **Hardened tool selection** — tool names are resolved at session creation time. Extension allowlists, EXCLUDED_TOOL_NAMES, and disallowedTools are all applied before the session starts, not after.
- **Stop/cancel hardening** — `stopRequested` flag prevents phantom `stopped` statuses; background concurrency slot is released exactly once via `backgroundSlotReleased` guard.
- **`send_message` alias** — compatibility alias for `message_parent` so agents expecting either name work without changes.
- **Stale notification suppression** — post-consumption messages and completion nudges are dropped after `get_subagent_result` has already consumed the result.
- **Result preview rendering** — background agent completions render a capped, safe preview instead of raw output.
- **Dynamic agent routing hints** — the `Agent` tool description generates routing guidelines at registration time from each agent's `description` frontmatter field, so custom agents (e.g. `worker`, `reviewer`) are surfaced as routing options alongside built-ins without manual edits.
- **Sequential numeric agent IDs** — agents get IDs like `1`, `2`, `3` instead of random strings, making logs and references easier to read.
- **`get_subagent_result(wait=true)`** — can await queued (not yet started) agents in addition to running ones.
- **Fuzzy model selection and crash guards** — unknown model strings and undefined `subagent_type` values are handled gracefully instead of crashing.
- **Ephemeral child session guard** — lifecycle/UI events from in-memory child sessions are ignored so they don't interfere with the parent session state.
- **Card grid widget** — running agents display as colored ANSI card widgets above the editor (ported from `pi-subagent-in-memory`), with `/agents-view` to toggle back to the classic tree layout.

<img width="600" alt="pi-subagents screenshot" src="https://github.com/anh-chu/pi-subagents/raw/master/media/screenshot.png" />


https://github.com/user-attachments/assets/8685261b-9338-4fea-8dfe-1c590d5df543


## Features

- **Claude Code look & feel** — same tool names, calling conventions, and UI patterns (`Agent`, `get_subagent_result`, `steer_subagent`, `reply_to_subagent`) — feels native
- **Parallel background agents** — spawn multiple agents that run concurrently with automatic queuing (configurable concurrency limit, default 4) and smart group join (consolidated notifications)
- **Live widget UI** — persistent above-editor widget showing running agents as colored card widgets (default) or classic spinner tree rows; toggle with `/agents-view`
- **Conversation viewer** — select any agent in `/agents` to open a live-scrolling overlay of its full conversation (auto-follows new content, scroll up to pause)
- **Custom agent types** — define agents in `.pi/agents/<name>.md` with YAML frontmatter: custom system prompts, model selection, thinking levels, tool restrictions
- **Mid-run steering** — inject messages into running agents to redirect their work without restarting
- **Parent↔subagent bridge** — subagents can queue one-way updates with `message_parent`, and background subagents can ask blocking questions with `ask_parent`; the parent replies with `reply_to_subagent`
- **Session resume** — pick up where an agent left off, preserving full conversation context
- **Graceful turn limits** — agents get a "wrap up" warning before hard abort, producing clean partial results instead of cut-off output
- **Case-insensitive agent types** — `"explore"`, `"Explore"`, `"EXPLORE"` all work. Unknown types fall back to general-purpose with a note
- **Fuzzy model selection** — specify models by name (`"haiku"`, `"sonnet"`) instead of full IDs, with automatic filtering to only available/configured models
- **Context inheritance** — optionally fork the parent conversation into a sub-agent so it knows what's been discussed
- **Persistent agent memory** — three scopes (project, local, user) with automatic read-only fallback for agents without write tools
- **Git worktree isolation** — run agents in isolated repo copies; changes auto-committed to branches on completion
- **Skill preloading** — inject named skill files from `.pi/skills/` into agent system prompts
- **Tool denylist** — block specific tools via `disallowed_tools` frontmatter
- **Styled completion notifications** — background agent results render as themed, compact notification boxes (icon, stats, result preview) instead of raw XML. Expandable to show full output. Group completions render each agent individually
- **Event bus** — lifecycle events (`subagents:created`, `started`, `completed`, `failed`, `steered`) emitted via `pi.events`, enabling other extensions to react to sub-agent activity
- **Cross-extension RPC** — other pi extensions can spawn and stop subagents via the `pi.events` event bus (`subagents:rpc:ping`, `subagents:rpc:spawn`, `subagents:rpc:stop`). Standardized reply envelopes with protocol versioning. Emits `subagents:ready` on load
- **Agent chains** — run agents sequentially with `{previous}` placeholder to pipe each step's output into the next prompt. Fail-fast on any step error

## Install

```bash
pi install npm:@anh-chu/pi-subagents
```

Or load directly for development:

```bash
pi -e ./src/index.ts
```

## Quick Start

The parent agent spawns sub-agents using the `Agent` tool:

```
Agent({
  subagent_type: "Explore",
  prompt: "Find all files that handle authentication",
  description: "Find auth files",
  run_in_background: true,
})
```

Foreground agents block until complete and return results inline. Background agents return an ID immediately and notify you on completion.

Subagents launched by this extension also get native bridge tools:
- `message_parent` — queue a one-way update for the parent
- `ask_parent` — queue a question and wait for `reply_to_subagent` (background agents only)

These bridge messages are **queue-first**: the subagent tool call returns after enqueueing (or waits on the reply for `ask_parent`), and the parent receives the queued update at the next safe turn boundary. Delivery is scoped to the parent session that spawned the subagent. Notifications contain only metadata and `request_id`s; the parent must explicitly fetch the raw payload with `get_subagent_message`. Queued questions also wake a parent turn so the parent can fetch the payload and explicitly answer with `reply_to_subagent`.

## UI

The extension renders a persistent widget above the editor showing all active agents:

```
● Agents
├─ ⠹ Agent  Refactor auth module · ⟳5≤30 · 5 tool uses · 33.8k token · 12.3s
│    ⎿  editing 2 files…
├─ ⠹ Explore  Find auth files · ⟳3 · 3 tool uses · 12.4k token · 4.1s
│    ⎿  searching…
└─ 2 queued
```

Individual agent results render Claude Code-style in the conversation:

| State | Example |
|-------|---------|
| **Running** | `⠹ ⟳3≤30 · 3 tool uses · 12.4k token` / `⎿ searching, reading 3 files…` |
| **Completed** | `✓ ⟳8 · 5 tool uses · 33.8k token · 12.3s` / `⎿ Done` |
| **Wrapped up** | `✓ ⟳50≤50 · 50 tool uses · 89.1k token · 45.2s` / `⎿ Wrapped up (turn limit)` |
| **Stopped** | `■ ⟳3 · 3 tool uses · 12.4k token` / `⎿ Stopped` |
| **Error** | `✗ ⟳3 · 3 tool uses · 12.4k token` / `⎿ Error: timeout` |
| **Aborted** | `✗ ⟳55≤50 · 55 tool uses · 102.3k token` / `⎿ Aborted (max turns exceeded)` |

Completed results can be expanded (ctrl+o in pi) to show the full agent output inline.

Background agent completion notifications render as styled boxes:

```
✓ Find auth files completed
  ⟳3 · 3 tool uses · 12.4k token · 4.1s
  ⎿  Found 5 files related to authentication...
  transcript: .pi/output/agent-abc123.jsonl
```

Group completions render each agent as a separate block. The LLM receives structured `<task-notification>` XML for parsing, while the user sees the themed visual.

## Default Agent Types

| Type | Tools | Model | Prompt Mode | Description |
|------|-------|-------|-------------|-------------|
| `general-purpose` | all 7 | inherit | `append` (parent twin) | Inherits the parent's full system prompt — same rules, CLAUDE.md, project conventions |
| `Explore` | read, bash, grep, find, ls | inherit | `replace` (standalone) | Codebase exploration (read-only) |
| `Plan` | read, bash, grep, find, ls | inherit | `replace` (standalone) | Software architect for implementation planning (read-only) |

> **Tip:** Since all agents inherit the parent's model by default, consider creating overrides for task-appropriate models. For `Explore`, use a fast/cheap model (e.g., haiku). For `Plan`, use a capable model (e.g., opus or sonnet). See [Custom Agents](#custom-agents) below.

Default agents can be **ejected** (`/agents` → select agent → Eject) to export them as `.md` files for customization, **overridden** by creating a `.md` file with the same name (e.g. `.pi/agents/general-purpose.md`), or **disabled** per-project with `enabled: false` frontmatter.

## Custom Agents

Define custom agent types by creating `.md` files. The filename becomes the agent type name. Any name is allowed — using a default agent's name overrides it.

Agents are discovered from two locations (higher priority wins):

| Priority | Location | Scope |
|----------|----------|-------|
| 1 (highest) | `.pi/agents/<name>.md` | Project — per-repo agents |
| 2 | `~/.pi/agent/agents/<name>.md` | Global — available everywhere |

Project-level agents override global ones with the same name, so you can customize a global agent for a specific project.

### Example: `.pi/agents/auditor.md`

```markdown
---
description: Security Code Reviewer
tools: read, grep, find, bash
model: anthropic/claude-opus-4-6
thinking: high
max_turns: 30
---

You are a security auditor. Review code for vulnerabilities including:
- Injection flaws (SQL, command, XSS)
- Authentication and authorization issues
- Sensitive data exposure
- Insecure configurations

Report findings with file paths, line numbers, severity, and remediation advice.
```

Then spawn it like any built-in type:

```
Agent({ subagent_type: "auditor", prompt: "Review the auth module", description: "Security audit" })
```

### Frontmatter Fields

All fields are optional — sensible defaults for everything.

| Field | Default | Description |
|-------|---------|-------------|
| `description` | filename | Agent description shown in tool listings |
| `display_name` | — | Display name for UI (e.g. widget, agent list) |
| `tools` | all 7 | Comma-separated built-in tools: read, bash, edit, write, grep, find, ls. `none` for no tools |
| `extensions` | `true` | Inherit MCP/extension tools. `false` to disable |
| `skills` | `true` | Inherit skills from parent. Can be a comma-separated list of skill names to preload from `.pi/skills/` |
| `memory` | — | Persistent agent memory scope: `project`, `local`, or `user`. Auto-detects read-only agents |
| `disallowed_tools` | — | Comma-separated tools to deny even if extensions provide them |
| `isolation` | — | Set to `worktree` to run in an isolated git worktree |
| `model` | inherit parent | Model — `provider/modelId` or fuzzy name (`"haiku"`, `"sonnet"`) |
| `thinking` | inherit | off, minimal, low, medium, high, xhigh |
| `max_turns` | unlimited | Max agentic turns before graceful shutdown. `0` or omit for unlimited |
| `prompt_mode` | `replace` | `replace`: body is the full system prompt. `append`: body appended to parent's prompt (agent acts as a "parent twin" with optional extra instructions) |
| `inherit_context` | `false` | Fork parent conversation into agent |
| `run_in_background` | `false` | Run in background by default |
| `isolation` | — | `worktree`: run in a temporary git worktree for full repo isolation |
| `isolated` | `false` | No extension/MCP tools, only built-in |
| `enabled` | `true` | Set to `false` to disable an agent (useful for hiding a default agent per-project) |

Frontmatter is authoritative. If an agent file sets `model`, `thinking`, `max_turns`, `inherit_context`, `run_in_background`, `isolated`, or `isolation`, those values are locked for that agent. `Agent` tool parameters only fill fields the agent config leaves unspecified.

## Tools

### `Agent`

Launch a sub-agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The task for the agent |
| `description` | string | yes | Short 3-5 word summary (shown in UI) |
| `subagent_type` | string | yes | Agent type (built-in or custom) |
| `model` | string | no | Model — `provider/modelId` or fuzzy name (`"haiku"`, `"sonnet"`) |
| `thinking` | string | no | Thinking level: off, minimal, low, medium, high, xhigh |
| `max_turns` | number | no | Max agentic turns. Omit for unlimited (default) |
| `run_in_background` | boolean | no | Run without blocking |
| `resume` | string | no | Agent ID to resume a previous session |
| `isolated` | boolean | no | No extension/MCP tools |
| `isolation` | `"worktree"` | no | Run in an isolated git worktree |
| `inherit_context` | boolean | no | Fork parent conversation into agent |
| `chain` | array | no | Sequential chain of agents (see [Chain mode](#chain-mode)) |

### `get_subagent_result`

Check status and retrieve results from a background agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | yes | Agent ID to check |
| `wait` | boolean | no | Wait for completion |
| `verbose` | boolean | no | Include full conversation log |

### `steer_subagent`

Send a steering message to a running agent. The message interrupts after the current tool execution.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | yes | Agent ID to steer |
| `message` | string | yes | Message to inject into agent conversation |

### `get_subagent_message`

Fetch the raw payload for a queued parent-bridge notification.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request_id` | string | yes | Request ID from the queued parent-bridge notification |

### `reply_to_subagent`

Reply to a queued `ask_parent` request from a running subagent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request_id` | string | yes | Request ID from the queued parent-bridge notification |
| `message` | string | yes | Reply text sent back to the waiting subagent |

### Sub-agent bridge tools

These tools are injected automatically into subagents spawned by this extension. They are not top-level user tools; the parent sees their queued output and answers with `reply_to_subagent` when needed. Queued bridge traffic is scoped to the parent session that launched the subagent.

#### `message_parent`

Queue a one-way update for the parent agent. The tool returns a `requestId` immediately after enqueueing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | yes | Update to send to the parent |

#### `ask_parent`

Queue a question for the parent agent and wait for a reply. This tool is only injected into background subagents to avoid deadlocking foreground runs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | yes | Question or request for the parent |
| `timeout_ms` | number | no | Optional timeout while waiting for `reply_to_subagent` |

**Queue-first semantics:** both bridge tools enqueue their message first. Parent updates are flushed in creation order at the next safe turn boundary and only into the originating parent session. Notifications contain metadata plus `request_id`s instead of raw subagent text. One-way updates do not auto-trigger the parent; use `get_subagent_message` to inspect them. Queued `ask_parent` questions wake a parent turn so the parent can explicitly fetch the payload and answer with `reply_to_subagent`. Timed-out asks are removed from the queue.

## Commands

| Command | Description |
|---------|-------------|
| `/agents` | Interactive agent management menu |

The `/agents` command opens an interactive menu:

```
Running agents (2) — 1 running, 1 done     ← only shown when agents exist
Agent types (6)                             ← unified list: defaults + custom
Create new agent                            ← manual wizard or AI-generated
Settings                                    ← max concurrency, max turns, grace turns, join mode
```

- **Agent types** — unified list with source indicators: `•` (project), `◦` (global), `✕` (disabled). Select an agent to manage it:
  - **Default agents** (no override): Eject (export as `.md`), Disable
  - **Default agents** (ejected/overridden): Edit, Disable, Reset to default, Delete
  - **Custom agents**: Edit, Disable, Delete
  - **Disabled agents**: Enable, Edit, Delete
- **Eject** — writes the embedded default config as a `.md` file to project or personal location, so you can customize it
- **Disable/Enable** — toggle agent availability. Disabled agents stay visible in the list (marked `✕`) and can be re-enabled
- **Create new agent** — choose project/personal location, then manual wizard (step-by-step prompts for name, tools, model, thinking, system prompt) or AI-generated (describe what the agent should do and a sub-agent writes the `.md` file). Any name is allowed, including default agent names (overrides them)
- **Settings** — configure max concurrency, default max turns, grace turns, and join mode at runtime

## Graceful Max Turns

Instead of hard-aborting at the turn limit, agents get a graceful shutdown:

1. At `max_turns` — steering message: *"Wrap up immediately — provide your final answer now."*
2. Up to 5 grace turns to finish cleanly
3. Hard abort only after the grace period

| Status | Meaning | Icon |
|--------|---------|------|
| `completed` | Finished naturally | `✓` green |
| `steered` | Hit limit, wrapped up in time | `✓` yellow |
| `aborted` | Grace period exceeded | `✗` red |
| `stopped` | User-initiated abort | `■` dim |

## Concurrency

Background agents are subject to a configurable concurrency limit (default: 4). Excess agents are automatically queued and start as running agents complete. The widget shows queued agents as a collapsed count.

Foreground agents bypass the queue — they block the parent anyway.

## Join Strategies

When background agents complete, they notify the main agent. The **join mode** controls how these notifications are delivered. It applies only to background agents.

| Mode | Behavior |
|------|----------|
| `smart` (default) | 2+ background agents spawned in the same turn are auto-grouped into a single consolidated notification. Solo agents notify individually. |
| `async` | Each agent sends its own notification on completion (original behavior). Best when results need incremental processing. |
| `group` | Force grouping even when spawning a single agent. Useful when you know more agents will follow. |

**Timeout behavior:** When agents are grouped, a 30-second timeout starts after the first agent completes. If not all agents finish in time, a partial notification is sent with completed results and remaining agents continue with a shorter 15-second re-batch window for stragglers.

**Configuration:**
- Configure join mode in `/agents` → Settings → Join mode

## Events

Agent lifecycle events are emitted via `pi.events.emit()` so other extensions can react:

| Event | When | Key fields |
|-------|------|------------|
| `subagents:created` | Background agent registered | `id`, `type`, `description`, `isBackground` |
| `subagents:started` | Agent transitions to running (including queued→running) | `id`, `type`, `description` |
| `subagents:completed` | Agent finished successfully | `id`, `type`, `durationMs`, `tokens`, `toolUses`, `result` |
| `subagents:failed` | Agent errored, stopped, or aborted | same as completed + `error`, `status` |
| `subagents:steered` | Steering message sent | `id`, `message` |
| `subagents:ready` | Extension loaded and RPC handlers registered | — |

## Cross-Extension RPC

Other pi extensions can spawn and stop subagents programmatically via the `pi.events` event bus, without importing this package directly.

All RPC replies use a standardized envelope: `{ success: true, data?: T }` on success, `{ success: false, error: string }` on failure.

### Discovery

Listen for `subagents:ready` to know when RPC handlers are available:

```typescript
pi.events.on("subagents:ready", () => {
  // RPC handlers are registered — safe to call ping/spawn/stop
});
```

### Ping

Check if the subagents extension is loaded and get the protocol version:

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:ping:reply:${requestId}`, (reply) => {
  unsub();
  if (reply.success) console.log("Protocol version:", reply.data.version);
});
pi.events.emit("subagents:rpc:ping", { requestId });
```

### Spawn

Spawn a subagent and receive its ID:

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:spawn:reply:${requestId}`, (reply) => {
  unsub();
  if (!reply.success) {
    console.error("Spawn failed:", reply.error);
  } else {
    console.log("Agent ID:", reply.data.id);
  }
});
pi.events.emit("subagents:rpc:spawn", {
  requestId,
  type: "general-purpose",
  prompt: "Do something useful",
  options: { description: "My task", run_in_background: true },
});
```

### Stop

Stop a running agent by ID:

```typescript
const requestId = crypto.randomUUID();
const unsub = pi.events.on(`subagents:rpc:stop:reply:${requestId}`, (reply) => {
  unsub();
  if (!reply.success) console.error("Stop failed:", reply.error);
});
pi.events.emit("subagents:rpc:stop", { requestId, agentId: "agent-id-here" });
```

Reply channels are scoped per `requestId`, so concurrent requests don't interfere.

## Persistent Agent Memory

Agents can have persistent memory across sessions. Set `memory` in frontmatter to enable:

```yaml
---
memory: project   # project | local | user
---
```

| Scope | Location | Use case |
|-------|----------|----------|
| `project` | `.pi/agent-memory/<name>/` | Shared across the team (committed) |
| `local` | `.pi/agent-memory-local/<name>/` | Machine-specific (gitignored) |
| `user` | `~/.pi/agent-memory/<name>/` | Global personal memory |

Memory uses a `MEMORY.md` index file and individual memory files with frontmatter. Agents with write tools get full read-write access. **Read-only agents** (no `write`/`edit` tools) automatically get read-only memory — they can consume memories written by other agents but cannot modify them. This prevents unintended tool escalation.

The `disallowed_tools` field is respected when determining write capability — an agent with `tools: write` + `disallowed_tools: write` correctly gets read-only memory.

## Worktree Isolation

Set `isolation: worktree` to run an agent in a temporary git worktree:

```
Agent({ subagent_type: "refactor", prompt: "...", isolation: "worktree" })
```

The agent gets a full, isolated copy of the repository. On completion:
- **No changes:** worktree is cleaned up automatically
- **Changes made:** changes are committed to a new branch (`pi-agent-<id>`) and returned in the result

If the worktree cannot be created (not a git repo, no commits), the agent falls back to the main working directory with a warning.

## Chain Mode

Run agents sequentially, piping each step's output into the next via the `{previous}` placeholder:

```js
Agent({
  chain: [
    { subagent_type: "Explore", prompt: "Map the auth system" },
    { subagent_type: "Plan",    prompt: "Plan a refactor based on: {previous}" },
    { subagent_type: "worker",  prompt: "Implement: {previous}" },
  ]
})
```

Each step's final output replaces `{previous}` in the next step's prompt. If any step fails or is stopped, the chain halts immediately and reports which step failed.

Per-step overrides (`model`, `thinking`, `max_turns`, `description`) are supported. Top-level `model`/`thinking` on the `Agent` call serve as defaults for all steps.

## Skill Preloading

Skills can be preloaded as named files from `.pi/skills/` or `~/.pi/skills/`:

```yaml
---
skills: api-conventions, error-handling
---
```

Skill files (`.md`, `.txt`, or extensionless) are read and injected into the agent's system prompt. Project-level skills take priority over global ones. Symlinked skill files are rejected for security.

## Tool Denylist

Block specific tools from an agent even if extensions provide them:

```yaml
---
tools: read, bash, grep, write
disallowed_tools: write, edit
---
```

This is useful for creating agents that inherit extension tools but should not have write access.

## Architecture

```
src/
  index.ts            # Extension entry: tool/command registration, rendering
  types.ts            # Type definitions (AgentConfig, AgentRecord, etc.)
  default-agents.ts   # Embedded default agent configs (general-purpose, Explore, Plan)
  agent-types.ts      # Unified agent registry (defaults + user), tool factories
  agent-runner.ts     # Session creation, execution, graceful max_turns, steer/resume
  agent-manager.ts    # Agent lifecycle, concurrency queue, completion notifications
  cross-extension-rpc.ts # RPC handlers for cross-extension spawn/ping via pi.events
  group-join.ts       # Group join manager: batched completion notifications with timeout
  parent-bridge.ts    # Native parent↔subagent message queue + ask/reply coordination
  custom-agents.ts    # Load user-defined agents from .pi/agents/*.md
  memory.ts           # Persistent agent memory (resolve, read, build prompt blocks)
  skill-loader.ts     # Preload skill files from .pi/skills/
  output-file.ts      # Streaming output file transcripts for agent sessions
  worktree.ts         # Git worktree isolation (create, cleanup, prune)
  prompts.ts          # Config-driven system prompt builder
  context.ts          # Parent conversation context for inherit_context
  env.ts              # Environment detection (git, platform)
  ui/
    agent-widget.ts       # Persistent widget: spinners, activity, status icons, theming
    conversation-viewer.ts # Live conversation overlay for viewing agent sessions
```

## License

MIT.

Fork attribution: original package by [tintinweb](https://github.com/tintinweb).

---

<details>
<summary>Fork aggregation ledger (sources and credits)</summary>

This package aggregates improvements from four community forks of `@tintinweb/pi-subagents`:

- [`yzlin/pi-subagents:master`](https://github.com/yzlin/pi-subagents) — primary baseline (commit [`b9cc2da`](https://github.com/yzlin/pi-subagents/commit/b9cc2dadc286204a32f8a1864c466ff4c7c0de10)): parent-bridge foundation, bridge tests, pi 0.68.x compatibility
- [`elidickinson/pi-subagents:main`](https://github.com/elidickinson/pi-subagents) — stability fixes: group-join double-delivery, activity key collision, model resolver crash, queued-agent wait, sequential IDs, send_message alias, stale notification suppression
- [`mikeyobrien/pi-subagents-tintinweb:fix/isolate-agents-md-from-subagents`](https://github.com/mikeyobrien/pi-subagents-tintinweb) — AGENTS.md / APPEND_SYSTEM.md isolation
- [`Evizero/pi-subagents:custom`](https://github.com/Evizero/pi-subagents) — ephemeral session guard, stop/cancel hardening, result preview rendering, tool-selection hardening, session scoping, nested prompt normalization

Original project by [tintinweb](https://github.com/tintinweb).

</details>
