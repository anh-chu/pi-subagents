# pi-claude-subagents

A [pi](https://pi.dev) extension that provides Claude Code-style autonomous sub-agents. Spawn specialized agents to handle complex tasks in parallel — each runs in its own isolated session with dedicated tools, system prompts, and model selection.

> **Status:** Early release.

## How It Works

The parent agent spawns sub-agents using the `spawn_agent` tool. Each sub-agent runs in an isolated pi session with its own context window, tools, and system prompt. Agents can run in the foreground (blocking) or background (non-blocking with completion notifications).

```
spawn_agent({
  subagent_type: "Explore",
  prompt: "Find all files that handle authentication",
  description: "Find auth files",
  run_in_background: true,
})
```

## UI

The extension renders agent progress in a Claude Code-style UI with an animated spinner and live streaming:

**While running** — animated braille spinner, live activity + token count:
```
⠹ Agent  Find auth files
⠹ Find auth files · 3 tool uses · 12.4k tokens
   ⎿  searching, reading 3 files…
```

**Completed** — green checkmark with final stats:
```
✓ Find auth files · 5 tool uses · 33.8k tokens · 12.3s
   ⎿  Done
```

**Wrapped up** — yellow checkmark when the agent hit its turn limit but finished in time:
```
✓ Find auth files · 50 tool uses · 89.1k tokens · 45.2s
   ⎿  Wrapped up (turn limit)
```

**Stopped** — user-initiated abort:
```
■ Find auth files · 3 tool uses · 12.4k tokens
   ⎿  Stopped
```

**Background** — immediate return with agent ID:
```
⠹ Find auth files
   ⎿  Running in background (ID: a1b2c3d4e5f6g7h8i)
```

**Error / Aborted:**
```
✗ Find auth files · 3 tool uses · 12.4k tokens
   ⎿  Error: timeout
```
```
✗ Find auth files · 55 tool uses · 102.3k tokens
   ⎿  Aborted (max turns exceeded)
```

Completed results can be expanded (ctrl+o in pi) to show the full agent output inline. The `/agents` command shows a tree of all agents with status, tool uses, and duration.

## Install

```bash
pi install npm:pi-claude-subagents
```

Or load directly for development:

```bash
pi -e ~/projects/pi-claude-subagents/src/index.ts
```

## Built-in Agent Types

| Type | Tools | Description |
|------|-------|-------------|
| `general-purpose` | all 7 | Full read/write access for complex multi-step tasks |
| `Explore` | read, bash, grep, find, ls | Fast codebase exploration (read-only, defaults to haiku) |
| `Plan` | read, bash, grep, find, ls | Software architect for implementation planning (read-only) |
| `statusline-setup` | read, edit | Configuration editor |
| `claude-code-guide` | read, grep, find | Documentation and help queries |

## Custom Agents

Define custom agent types by creating `.pi/agents/<name>.md` files with YAML frontmatter and a system prompt body. The filename becomes the agent type name.

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

This creates an `auditor` agent type that can be spawned like any built-in type:

```
spawn_agent({ subagent_type: "auditor", prompt: "Review the auth module", description: "Security audit" })
```

### Frontmatter Fields

All fields are optional — sensible defaults for everything.

| Field | Type | Default (omitted) | Description |
|-------|------|-------------------|-------------|
| `description` | string | filename | Agent description shown in tool listings |
| `tools` | comma-separated | all 7 built-in tools | Built-in tools: read, bash, edit, write, grep, find, ls. Use `none` for no tools |
| `extensions` | boolean | `true` (inherit) | Inherit MCP/extension tools from parent. `false` or `none` to disable |
| `skills` | boolean | `true` (inherit) | Inherit skills from parent |
| `model` | string | inherit parent | Model as `provider/modelId` |
| `thinking` | string | inherit | Thinking level: off, minimal, low, medium, high, xhigh |
| `max_turns` | number | 50 | Maximum agentic turns before graceful shutdown |
| `prompt_mode` | string | `replace` | `replace`: body replaces system prompt. `append`: body appended to default prompt |
| `inherit_context` | boolean | `false` | Default: fork parent conversation into agent |
| `run_in_background` | boolean | `false` | Default: run agent in background |
| `isolated` | boolean | `false` | Default: no extension/MCP tools |

**Convention**: omitted = inherit from parent / use default; `none` or `false` = nothing; value = explicit.

**Spawn-time overrides**: Frontmatter sets defaults. The caller's explicit `spawn_agent` parameters always take precedence (e.g., frontmatter says `run_in_background: true` but caller passes `run_in_background: false` → foreground).

### Prompt Modes

- **`replace`** (default): The markdown body fully replaces the system prompt. You control the entire prompt.
- **`append`**: The body is appended to the default general-purpose system prompt (environment info, git safety rules, tool usage guidelines). Useful when you want the standard rules plus custom instructions.

## Tools

### `spawn_agent`

Launch a sub-agent. Parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The task for the agent |
| `description` | string | yes | Short 3-5 word summary (shown in UI) |
| `subagent_type` | string | yes | Agent type (built-in or custom) |
| `model` | string | no | Model as `provider/modelId` |
| `thinking` | string | no | Thinking level: off, minimal, low, medium, high, xhigh |
| `max_turns` | number | no | Max agentic turns (default: 50) |
| `run_in_background` | boolean | no | Run without blocking |
| `resume` | string | no | Agent ID to resume |
| `isolated` | boolean | no | No extension/MCP tools |
| `inherit_context` | boolean | no | Fork parent conversation |

### `get_agent_result`

Check status and retrieve results from a background agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | yes | Agent ID to check |
| `wait` | boolean | no | Wait for completion |
| `verbose` | boolean | no | Include full conversation |

### `steer_agent`

Send a steering message to a running agent. Interrupts after current tool execution.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | yes | Agent ID to steer |
| `message` | string | yes | Message to inject |

## Commands

| Command | Description |
|---------|-------------|
| `/agent <type> <prompt>` | Spawn a sub-agent interactively |
| `/agents` | List all agents with status |

### Examples

```
/agent Explore Find all TypeScript files that handle authentication
/agent Plan Design a caching layer for the API
/agent general-purpose Refactor the auth module to use JWT
/agent auditor Review the payment processing module
```

## Graceful Max Turns

Instead of hard-aborting when an agent reaches its turn limit, pi-claude-subagents uses a graceful shutdown:

1. At `max_turns`, the agent receives a steering message: *"You have reached your turn limit. Wrap up immediately — provide your final answer now."*
2. The agent gets up to 5 additional grace turns to finish
3. Only after the grace period does a hard abort occur

This produces three distinct completion states:

| Status | Meaning | UI |
|--------|---------|-----|
| `completed` | Finished naturally | `✓` green |
| `steered` | Hit turn limit, wrapped up in grace period | `✓` yellow + "Wrapped up (turn limit)" |
| `aborted` | Grace period also exceeded, hard-aborted | `✗` red + "Aborted (max turns exceeded)" |

User-initiated aborts (via the manager's `abort()` method) produce a separate `stopped` status shown as `■ Stopped`.

## Architecture

```
src/
  index.ts            # Extension entry: tool/command registration, Claude Code-style rendering
  types.ts            # Type definitions (SubagentType, AgentRecord, CustomAgentConfig)
  agent-types.ts      # Agent type registry (built-in + custom), tool factories
  agent-runner.ts     # Session creation, execution, graceful max_turns, steer/resume
  agent-manager.ts    # Agent lifecycle, background execution, completion notifications
  custom-agents.ts    # Load custom agents from .pi/agents/*.md
  prompts.ts          # System prompts per agent type
  context.ts          # Parent conversation context for inherit_context
  env.ts              # Async environment detection via pi.exec() (git, platform)
```

## License

MIT — [tintinweb](https://github.com/tintinweb)
