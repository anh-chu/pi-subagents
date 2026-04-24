# Libraries

> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.

**19 library files** across 17 modules

## Ui (3 files)

- `src/ui/agent-widget.ts` — formatTokens, formatMs, formatTurns, formatDuration, getDisplayName, getPromptModeLabel, …
- `src/ui/remembering-select.ts` — showRememberingSelect, RememberingSelectOption
- `src/ui/conversation-viewer.ts` — ConversationViewer

## Agent-manager.ts (1 files)

- `src/agent-manager.ts` — AgentManager, OnAgentComplete, OnAgentStart

## Agent-runner.ts (1 files)

- `src/agent-runner.ts` — normalizeMaxTurns, getDefaultMaxTurns, setDefaultMaxTurns, getGraceTurns, setGraceTurns, forwardAbortSignal, …

## Agent-types.ts (1 files)

- `src/agent-types.ts` — registerAgents, resolveType, getAgentConfig, getAvailableTypes, getAllTypes, getDefaultAgentNames, …

## Context.ts (1 files)

- `src/context.ts` — extractText, buildParentContext

## Cross-extension-rpc.ts (1 files)

- `src/cross-extension-rpc.ts` — registerRpcHandlers, EventBus, SpawnCapable, RpcDeps, RpcHandle, RpcReply, …

## Custom-agents.ts (1 files)

- `src/custom-agents.ts` — loadCustomAgents

## Env.ts (1 files)

- `src/env.ts` — detectEnv

## Group-join.ts (1 files)

- `src/group-join.ts` — GroupJoinManager, DeliveryCallback

## Invocation-config.ts (1 files)

- `src/invocation-config.ts` — resolveAgentInvocationConfig, resolveJoinMode

## Memory.ts (1 files)

- `src/memory.ts` — isUnsafeName, isSymlink, safeReadFile, resolveMemoryDir, ensureMemoryDir, readMemoryIndex, …

## Model-resolver.ts (1 files)

- `src/model-resolver.ts` — resolveModel, ModelEntry, ModelRegistry

## Output-file.ts (1 files)

- `src/output-file.ts` — createOutputFilePath, writeInitialEntry, streamToOutputFile

## Parent-bridge.ts (1 files)

- `src/parent-bridge.ts` — ParentBridge, QueuedParentMessage, ParentReply, DEFAULT_ASK_PARENT_TIMEOUT_MS, DEFAULT_PARENT_SESSION_ID, parentBridge

## Prompts.ts (1 files)

- `src/prompts.ts` — buildAgentPrompt, PromptExtras

## Skill-loader.ts (1 files)

- `src/skill-loader.ts` — preloadSkills, PreloadedSkill

## Worktree.ts (1 files)

- `src/worktree.ts` — createWorktree, cleanupWorktree, pruneWorktrees, WorktreeInfo, WorktreeCleanupResult

---
_Back to [overview.md](./overview.md)_