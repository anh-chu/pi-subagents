# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-05

### Added
- **Claude Code-style UI rendering** — `renderCall`/`renderResult`/`onUpdate` for live streaming progress
  - Live activity descriptions: "searching, reading 3 files…"
  - Token count display: "33.8k tokens"
  - Per-agent tool use counter
  - Expandable completed results (ctrl+o)
  - Distinct states: running, background, completed, error, aborted
- **Async environment detection** — replaced `execSync` with `pi.exec()` for non-blocking git/platform detection
- **Status bar integration** — running background agent count shown in pi's status bar

### Changed
- Tool label changed from "Spawn Agent" to "Agent" (matches Claude Code style)
- `onToolUse` callback replaced with richer `onToolActivity` (includes tool name + start/end)
- `onSessionCreated` callback for accessing session stats (token counts)
- `env.ts` now requires `ExtensionAPI` parameter (async `pi.exec()` instead of `execSync`)

## [0.1.0] - 2026-03-05

Initial release of `pi-claude-subagents`.

### Added
- **Autonomous sub-agents** — spawn specialized agents via `spawn_agent` tool, each running in an isolated pi session
- **Built-in agent types** — general-purpose, Explore (defaults to haiku), Plan, statusline-setup, claude-code-guide
- **Custom user-defined agents** — define agents in `.pi/agents/<name>.md` with YAML frontmatter + system prompt body
- **Frontmatter configuration** — tools, extensions, skills, model, thinking, max_turns, prompt_mode, inherit_context, run_in_background, isolated
- **Consistent three-state convention** — omitted = inherit, `none`/empty = nothing, listed = only those (for tools, extensions, skills)
- **Graceful max_turns** — steer message at limit, 5 grace turns, then hard abort; `aborted` status on result
- **Background execution** — `run_in_background` with completion notifications via `sendMessage`
- **`get_agent_result` tool** — check status, wait for completion, verbose conversation output
- **`steer_agent` tool** — inject steering messages into running agents mid-execution
- **Agent resume** — continue a previous agent's session with a new prompt
- **Context inheritance** — `inherit_context` forks the parent conversation into the sub-agent
- **Model override** — per-agent model selection via `provider/modelId` format
- **Thinking level** — per-agent extended thinking control, passed through to pi
- **Extension/skill allowlists** — granular control: inherit all, none, or specific named extensions/skills
- **`/agent` command** — interactive agent spawning
- **`/agents` command** — list all agents with status tree

[0.2.0]: https://github.com/tintinweb/pi-claude-subagents/releases/tag/v0.2.0
[0.1.0]: https://github.com/tintinweb/pi-claude-subagents/releases/tag/v0.1.0
