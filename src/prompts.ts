/**
 * prompts.ts — System prompt builder for agents.
 */

import type { AgentConfig, EnvInfo } from "./types.js";

/** Extra sections to inject into the system prompt (memory, skills, etc.). */
export interface PromptExtras {
  /** Persistent memory content to inject (first 200 lines of MEMORY.md + instructions). */
  memoryBlock?: string;
  /** Preloaded skill contents to inject. */
  skillBlocks?: { name: string; content: string }[];
}

/** Options for buildAgentPrompt behavior. */
export interface BuildAgentPromptOptions {
  /** Context in which the prompt is being used. "spawn" for agent spawning (sub-agent), "agent-mode" for agent-mode injection. */
  context?: "spawn" | "agent-mode";
}

/**
 * Strip <project_instructions> blocks from a system prompt to avoid duplication.
 * Used when embedding a parent's system prompt in append-mode agents, since the
 * loader will append fresh project_instructions when noContextFiles is false.
 *
 * @param prompt The prompt to clean.
 * @returns The prompt with <project_instructions>...</project_instructions> blocks removed.
 */
function stripProjectInstructions(prompt: string): string {
  // Remove <project_instructions path="...">...</project_instructions> blocks
  // and collapse multiple consecutive newlines
  return prompt
    .replace(/<project_instructions(?:\s[^>]*)?>([\s\S]*?)<\/project_instructions>/g, '')
    .replace(/\n\n\n+/g, '\n\n')
    .trim();
}

/**
 * Build the system prompt for an agent from its config.
 *
 * - "replace" mode: env header + config.systemPrompt (full control, no parent identity)
 * - "append" mode with context="spawn" (default): env header + parent system prompt + sub-agent context + config.systemPrompt
 * - "append" mode with context="agent-mode": env header + config.systemPrompt (no inherited system prompt or sub-agent context, as real parent is already natively present)
 * - "append" with empty systemPrompt: pure parent clone (spawn mode only)
 *
 * Both modes prepend an `<active_agent name="${config.name}"/>` tag so downstream
 * extensions (e.g. permission/policy systems) can resolve per-agent policy
 * inside the child session by parsing the system prompt.
 *
 * @param parentSystemPrompt  The parent agent's effective system prompt (for append mode with context="spawn").
 * @param extras  Optional extra sections to inject (memory, preloaded skills).
 * @param opts  Options for prompt building (context, etc.). Default context is "spawn".
 */
export function buildAgentPrompt(
  config: AgentConfig,
  cwd: string,
  env: EnvInfo,
  parentSystemPrompt?: string,
  extras?: PromptExtras,
  opts?: BuildAgentPromptOptions,
): string {
  const activeAgentTag = `<active_agent name="${config.name}"/>\n\n`;

  const envBlock = `# Environment
Working directory: ${cwd}
${env.isGitRepo ? `Git repository: yes\nBranch: ${env.branch}` : "Not a git repository"}
Platform: ${env.platform}`;

  // Build optional extras suffix
  const extraSections: string[] = [];
  if (extras?.memoryBlock) {
    extraSections.push(extras.memoryBlock);
  }
  if (extras?.skillBlocks?.length) {
    for (const skill of extras.skillBlocks) {
      extraSections.push(`\n# Preloaded Skill: ${skill.name}\n${skill.content}`);
    }
  }
  const extrasSuffix = extraSections.length > 0 ? "\n\n" + extraSections.join("\n") : "";

  if (config.promptMode === "append") {
    const customSection = config.systemPrompt?.trim()
      ? `\n\n<agent_instructions>\n${config.systemPrompt}\n</agent_instructions>`
      : "";

    // For agent-mode context, skip the inherited system prompt and sub-agent context,
    // since the real parent prompt is already natively present in the new session.
    if (opts?.context === "agent-mode") {
      return activeAgentTag + envBlock + customSection + extrasSuffix;
    }

    // Default "spawn" context: include inherited system prompt and sub-agent context bridge.
    // Strip project_instructions blocks from parent prompt since loader will append them fresh
    // (noContextFiles is false for append mode, so loader supplies fresh AGENTS.md).
    const identity = parentSystemPrompt ? stripProjectInstructions(parentSystemPrompt) : genericBase;

    const bridge = `<sub_agent_context>
You are operating as a sub-agent invoked to handle a specific task.
- Use the read tool instead of cat/head/tail
- Use the edit tool instead of sed/awk
- Use the write tool instead of echo/heredoc
- Use the find tool instead of bash find/ls for file search
- Use the grep tool instead of bash grep/rg for content search
- Make independent tool calls in parallel
- Use absolute file paths
- Do not use emojis
- Be concise but complete
</sub_agent_context>`;

    return activeAgentTag + envBlock + "\n\n<inherited_system_prompt>\n" + identity + "\n</inherited_system_prompt>\n\n" + bridge + customSection + extrasSuffix;
  }

  // "replace" mode — env header + the config's full system prompt
  const replaceHeader = `You are a pi coding agent sub-agent.
You have been invoked to handle a specific task autonomously.

${envBlock}`;

  return activeAgentTag + replaceHeader + "\n\n" + config.systemPrompt + extrasSuffix;
}

/** Fallback base prompt when parent system prompt is unavailable in append mode. */
const genericBase = `# Role
You are a general-purpose coding agent for complex, multi-step tasks.
You have full access to read, write, edit files, and execute commands.
Do what has been asked; nothing more, nothing less.`;
