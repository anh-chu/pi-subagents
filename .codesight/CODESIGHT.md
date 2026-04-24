# @anh-chu/pi-subagents — AI Context Map

> **Stack:** raw-http | none | unknown | typescript

> 0 routes | 0 models | 0 components | 19 lib files | 1 env vars | 0 middleware | 34 events | 0% test coverage
> **Token savings:** this file is ~2,500 tokens. Without it, AI exploration would cost ~20,700 tokens. **Saves ~18,200 tokens per conversation.**
> **Last scanned:** 2026-04-23 11:08 — re-run after significant changes

---

# Libraries

- `src/agent-manager.ts`
  - class AgentManager
  - type OnAgentComplete
  - type OnAgentStart
- `src/agent-runner.ts`
  - function normalizeMaxTurns: (n) => number | undefined
  - function getDefaultMaxTurns: () => number | undefined
  - function setDefaultMaxTurns: (n) => void
  - function getGraceTurns: () => number
  - function setGraceTurns: (n) => void
  - function forwardAbortSignal: (session, signal?) => () => void
  - _...7 more_
- `src/agent-types.ts`
  - function registerAgents: (userAgents, AgentConfig>) => void
  - function resolveType: (name) => string | undefined
  - function getAgentConfig: (name) => AgentConfig | undefined
  - function getAvailableTypes: () => string[]
  - function getAllTypes: () => string[]
  - function getDefaultAgentNames: () => string[]
  - _...10 more_
- `src/context.ts` — function extractText: (content) => string, function buildParentContext: (ctx) => string
- `src/cross-extension-rpc.ts`
  - function registerRpcHandlers: (deps) => RpcHandle
  - interface EventBus
  - interface SpawnCapable
  - interface RpcDeps
  - interface RpcHandle
  - type RpcReply
  - _...1 more_
- `src/custom-agents.ts` — function loadCustomAgents: (cwd) => Map<string, AgentConfig>
- `src/env.ts` — function detectEnv: (pi, cwd) => Promise<EnvInfo>
- `src/group-join.ts` — class GroupJoinManager, type DeliveryCallback
- `src/invocation-config.ts` — function resolveAgentInvocationConfig: (agentConfig, params) => void, function resolveJoinMode: (defaultJoinMode, runInBackground) => JoinMode | undefined
- `src/memory.ts`
  - function isUnsafeName: (name) => boolean
  - function isSymlink: (filePath) => boolean
  - function safeReadFile: (filePath) => string | undefined
  - function resolveMemoryDir: (agentName, scope, cwd) => string
  - function ensureMemoryDir: (memoryDir) => void
  - function readMemoryIndex: (memoryDir) => string | undefined
  - _...2 more_
- `src/model-resolver.ts`
  - function resolveModel: (input, registry) => Model<Api> | string
  - interface ModelEntry
  - interface ModelRegistry
- `src/output-file.ts`
  - function createOutputFilePath: (cwd, agentId, sessionId) => string
  - function writeInitialEntry: (path, agentId, prompt, cwd) => void
  - function streamToOutputFile: (session, path, agentId, cwd) => () => void
- `src/parent-bridge.ts`
  - class ParentBridge
  - interface QueuedParentMessage
  - interface ParentReply
  - const DEFAULT_ASK_PARENT_TIMEOUT_MS
  - const DEFAULT_PARENT_SESSION_ID
  - const parentBridge
- `src/prompts.ts` — function buildAgentPrompt: (config, cwd, env, parentSystemPrompt?, extras?) => string, interface PromptExtras
- `src/skill-loader.ts` — function preloadSkills: (skillNames, cwd) => PreloadedSkill[], interface PreloadedSkill
- `src/ui/agent-widget.ts`
  - function formatTokens: (count) => string
  - function formatMs: (ms) => string
  - function formatTurns: (turnCount, maxTurns?) => string
  - function formatDuration: (startedAt, completedAt?) => string
  - function getDisplayName: (type) => string
  - function getPromptModeLabel: (type) => string | undefined
  - _...9 more_
- `src/ui/conversation-viewer.ts` — class ConversationViewer
- `src/ui/remembering-select.ts` — function showRememberingSelect: (ctx, "ui">, title, options, config) => Promise<string | undefined>, interface RememberingSelectOption
- `src/worktree.ts`
  - function createWorktree: (cwd, agentId) => WorktreeInfo | undefined
  - function cleanupWorktree: (cwd, worktree, agentDescription) => WorktreeCleanupResult
  - function pruneWorktrees: (cwd) => void
  - interface WorktreeInfo
  - interface WorktreeCleanupResult

---

# Config

## Environment Variables

- `HOME` **required** — test/custom-agents.test.ts

## Config Files

- `tsconfig.json`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `src/types.ts` — imported by **17** files
- `src/parent-bridge.ts` — imported by **6** files
- `src/agent-runner.ts` — imported by **5** files
- `src/agent-types.ts` — imported by **5** files
- `src/index.ts` — imported by **5** files
- `src/agent-manager.ts` — imported by **4** files
- `src/context.ts` — imported by **2** files
- `src/env.ts` — imported by **2** files
- `src/memory.ts` — imported by **2** files
- `src/prompts.ts` — imported by **2** files
- `src/skill-loader.ts` — imported by **2** files
- `src/custom-agents.ts` — imported by **2** files
- `src/group-join.ts` — imported by **2** files
- `src/model-resolver.ts` — imported by **2** files
- `src/ui/conversation-viewer.ts` — imported by **2** files
- `src/worktree.ts` — imported by **1** files
- `src/default-agents.ts` — imported by **1** files
- `src/cross-extension-rpc.ts` — imported by **1** files
- `src/ui/remembering-select.ts` — imported by **1** files
- `src/ui/agent-widget.ts` — imported by **1** files

## Import Map (who imports what)

- `src/types.ts` ← `src/agent-runner.ts`, `src/agent-types.ts`, `src/custom-agents.ts`, `src/default-agents.ts`, `src/env.ts` +12 more
- `src/parent-bridge.ts` ← `src/agent-manager.ts`, `src/agent-runner.ts`, `test/agent-manager-parent-bridge.test.ts`, `test/agent-runner.test.ts`, `test/index-parent-bridge.test.ts` +1 more
- `src/agent-runner.ts` ← `src/agent-manager.ts`, `test/agent-manager-parent-bridge.test.ts`, `test/agent-manager.test.ts`, `test/agent-runner.test.ts`, `test/index-subagent-session.test.ts`
- `src/agent-types.ts` ← `src/custom-agents.ts`, `src/ui/agent-widget.ts`, `test/agent-runner.test.ts`, `test/custom-agents.test.ts`, `test/prompts.test.ts`
- `src/index.ts` ← `test/agents-command.test.ts`, `test/index-parent-bridge.test.ts`, `test/index-render.test.ts`, `test/index-subagent-session.test.ts`, `test/index.test.ts`
- `src/agent-manager.ts` ← `src/index.ts`, `src/ui/agent-widget.ts`, `test/agent-manager-parent-bridge.test.ts`, `test/agent-manager.test.ts`
- `src/context.ts` ← `src/agent-runner.ts`, `src/ui/conversation-viewer.ts`
- `src/env.ts` ← `src/agent-runner.ts`, `test/env.test.ts`
- `src/memory.ts` ← `src/agent-runner.ts`, `src/skill-loader.ts`
- `src/prompts.ts` ← `src/agent-runner.ts`, `test/prompts.test.ts`

---

# Events & Queues

- `${channel}:reply:${params.requestId}` [event] — `src/cross-extension-rpc.ts`
- `subagents:failed` [event] — `src/index.ts`
- `subagents:completed` [event] — `src/index.ts`
- `subagents:started` [event] — `src/index.ts`
- `session_start` [event] — `src/index.ts`
- `session_switch` [event] — `src/index.ts`
- `subagents:ready` [event] — `src/index.ts`
- `session_shutdown` [event] — `src/index.ts`
- `tool_execution_start` [event] — `src/index.ts`
- `tool_execution_end` [event] — `src/index.ts`
- `turn_end` [event] — `src/index.ts`
- `agent_end` [event] — `src/index.ts`
- `subagents:created` [event] — `src/index.ts`
- `subagents:steered` [event] — `src/index.ts`
- `subagents:rpc:ping:reply:req-1` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:ping` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:ping:reply:req-other` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-s1` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-s2` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-s3` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-s4` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-other` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-s5` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-s6` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:stop:reply:req-st1` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:stop` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:stop:reply:req-st2` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:stop:reply:req-other` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:stop:reply:req-st3` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:stop:reply:req-st4` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-a` [event] — `test/cross-extension-rpc.test.ts`
- `subagents:rpc:spawn:reply:req-b` [event] — `test/cross-extension-rpc.test.ts`
- `agent_start` [event] — `test/index-subagent-session.test.ts`

---

# Test Coverage

> **0%** of routes and models are covered by tests
> 23 test files found

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_