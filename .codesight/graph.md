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
