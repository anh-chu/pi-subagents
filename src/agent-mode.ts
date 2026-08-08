/**
 * agent-mode.ts — Switch the persona (system prompt, model, tools, thinking
 * level) the current session behaves as, without ever clearing context.
 *
 * Design: the user manages their own context (via /compact, /fork, or
 * starting a new session when they actually want a clean slate). This
 * extension never does that automatically. Every switch — /agent-mode,
 * @@agent_name, agent-mode-off, @@main — is the same live, in-place
 * operation: swap model/tools/thinking via pi.setModel()/setActiveTools()/
 * setThinkingLevel() and seed a hidden system-prompt message, all in the
 * current session. Nothing is ever replaced or discarded.
 *
 * (An earlier version used ctx.newSession() to start a brand-new session per
 * switch. That's a heavier, session-replacing operation with its own sharp
 * edges — e.g. ctx.newSession() is only reachable from registerCommand
 * handlers, not from "input" event handlers, which is why @@name couldn't
 * use it — and it fought the "user self-manages context" goal by forcibly
 * clearing it. Dropped in favor of the simpler, consistent live-switch below.)
 */

import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getAgentConfig } from "./agent-types.js";
import { detectEnv } from "./env.js";
import { resolveModel } from "./model-resolver.js";
import { buildAgentPrompt } from "./prompts.js";
import { preloadSkills } from "./skill-loader.js";
import type { AgentConfig, ThinkingLevel } from "./types.js";

/** Model/tools/thinking captured right before the first agent-mode switch,
 *  so turning agent-mode off can restore them. */
export interface PreviousAgentState {
  model?: Model<any>;
  tools?: string[];
  thinking?: ThinkingLevel;
}

export interface AgentModeState {
  /** Name of the agent the user selected, or undefined for no active override. */
  activeAgent?: string;
  /** Display name used in status/toasts. */
  displayName?: string;
  /** State to restore on agent-mode-off / "@@main". */
  previous?: PreviousAgentState;
}

/** Per-extension-instance state. Only one agent-mode can be active at a time. */
let currentMode: AgentModeState = {};

export function getAgentMode(): AgentModeState {
  return currentMode;
}

export function setAgentMode(state: AgentModeState): void {
  currentMode = state;
}

export function clearAgentMode(): void {
  currentMode = {};
}

/**
 * Snapshot current model/tools/thinking, but only on the transition from
 * "no agent-mode" to "agent-mode". Chained switches (agent A -> agent B ->
 * off) then restore the true original state, not agent A's — matches the
 * pattern used by the SDK's preset.ts example.
 */
function capturePreviousState(
  model: Model<any> | undefined,
  tools: string[],
  thinking: ThinkingLevel | undefined,
): PreviousAgentState {
  return currentMode.previous ?? { model, tools, thinking };
}

/** Restore the pre-agent-mode model/tools/thinking live, in place. Context
 *  (conversation history) is never touched — it was never removed. */
async function restorePreviousAgentState(pi: ExtensionAPI): Promise<void> {
  const prev = currentMode.previous;
  clearAgentMode();
  if (!prev) return;
  if (prev.model) {
    try {
      await pi.setModel(prev.model);
    } catch {
      // Ignore — leave whatever model is currently active.
    }
  }
  if (prev.thinking) {
    pi.setThinkingLevel(prev.thinking);
  }
  if (prev.tools) {
    pi.setActiveTools(prev.tools);
  }
}

/** Build the system prompt for an agent-mode switch. */
export async function buildAgentModePrompt(
  pi: ExtensionAPI,
  config: AgentConfig,
  cwd: string,
): Promise<string> {
  const env = await detectEnv(pi, cwd);
  return buildAgentPrompt(config, cwd, env, undefined, {
    skillBlocks: Array.isArray(config.skills)
      ? preloadSkills(config.skills, cwd)
      : undefined,
  });
}

/**
 * Resolve the effective model for an agent-mode switch.
 * Returns the Model, or a string error if unavailable.
 */
export function resolveAgentModeModel(
  config: AgentConfig,
  parentModel: Model<any> | undefined,
  registry: { find(provider: string, modelId: string): Model<any> | undefined; getAvailable?(): Model<any>[] },
): Model<any> | undefined | string {
  // Agent config model is authoritative; parent model is fallback.
  const modelInput = config.model;
  if (!modelInput) return parentModel;
  return resolveModel(modelInput, registry as any);
}

/**
 * Compute the tool allowlist for an agent-mode switch.
 * Mirrors agent-runner logic but simplified: built-ins + ext tools (all when
 * extensions true), minus disallowedTools.
 */
export async function resolveAgentModeTools(
  _pi: ExtensionAPI,
  config: AgentConfig,
  ctx: { getAllTools(): { name: string; sourceInfo?: { source?: string; path?: string; origin?: string } }[] },
): Promise<string[]> {
  const allTools = ctx.getAllTools().map(t => t.name);
  const builtinToolNames = config.builtinToolNames ?? ["read", "bash", "edit", "write", "grep", "find", "ls"];

  // Extension tools: when extensions is true, include all loaded extension tools.
  // When extensions is false, include none. When a list, include tools from
  // listed extensions. (We keep it simple here: true → all ext tools, false → none,
  // string[] → all ext tools whose extension name matches — this is a pragmatic
  // approximation; ext: narrowing applies at child-agent time if needed.)
  const extensionTools: string[] = [];
  if (config.extensions !== false) {
    const allExtTools = ctx.getAllTools().filter(t => t.sourceInfo?.origin === "package" || t.sourceInfo?.origin === "top-level");
    if (Array.isArray(config.extensions)) {
      const whitelist = new Set(config.extensions.map(e => e.toLowerCase()));
      for (const t of allExtTools) {
        const sourceId = t.sourceInfo?.source?.toLowerCase() ?? "";
        const pathLower = t.sourceInfo?.path?.toLowerCase() ?? "";
        const nameLower = pathLower.split("/").pop()?.replace(/\.(ts|js)$/i, "") ?? "";
        if (whitelist.has(sourceId) || whitelist.has(pathLower) || whitelist.has(nameLower)) {
          extensionTools.push(t.name);
        }
      }
    } else {
      for (const t of allExtTools) extensionTools.push(t.name);
    }
  }

  const disallowed = new Set(config.disallowedTools?.map(d => d.toLowerCase()) ?? []);
  const allowed = new Set([...builtinToolNames, ...extensionTools]);
  const final = [...allowed].filter(t => !disallowed.has(t.toLowerCase()));

  // Safety: if a requested tool does not exist, drop it rather than erroring.
  const existing = new Set(allTools);
  return final.filter(t => existing.has(t));
}

export interface AgentModeEntryData {
  agentName: string;
  displayName: string;
  systemPrompt: string;
  tools: string[];
}

/**
 * Switch the current session's persona live, in place. Used by both the
 * /agent-mode command and the @@agent_name chat shorthand — they are
 * identical operations; only the entry point (slash command vs. raw input)
 * differs. Never touches conversation history.
 */
export async function switchAgentMode(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  agentName: string,
): Promise<{ ok: true; displayName: string } | { ok: false; message: string }> {
  const config = getAgentConfig(agentName);
  if (!config) return { ok: false, message: `Unknown agent type: "${agentName}"` };
  if (config.enabled === false) return { ok: false, message: `Agent "${agentName}" is disabled.` };

  const previous = capturePreviousState(ctx.model, pi.getActiveTools(), pi.getThinkingLevel());
  const displayName = config.displayName ?? config.name;
  const systemPrompt = await buildAgentModePrompt(pi, config, ctx.cwd);
  const modelOrError = config.model
    ? resolveAgentModeModel(config, undefined, ctx.modelRegistry as any)
    : undefined;
  const resolvedModel = typeof modelOrError !== "string" && modelOrError ? modelOrError : undefined;
  const tools = await resolveAgentModeTools(pi, config, pi);

  if (resolvedModel) {
    const ok = await pi.setModel(resolvedModel);
    if (!ok) {
      pi.appendEntry("agent-mode-warning", { message: `No API key for ${resolvedModel.provider}/${resolvedModel.id}` });
    }
  }
  if (config.thinking) {
    pi.setThinkingLevel(config.thinking);
  }
  pi.setActiveTools(tools);
  pi.sendMessage({
    customType: "agent-mode-instructions",
    content: [{ type: "text", text: systemPrompt }],
    display: false,
  });
  pi.appendEntry("agent-mode-config", { agentName: config.name, displayName, systemPrompt, tools } as AgentModeEntryData);

  setAgentMode({ activeAgent: config.name, displayName, previous });
  return { ok: true, displayName };
}

/** Register /agent-mode, /agent-mode-off, and the @@name / @@main input shorthand. */
export function registerAgentModeCommands(pi: ExtensionAPI): void {
  // "@@agent_name" / "@@main" quick-switch shorthand, typed directly into
  // the chat input (no leading "/"). Same operation as the slash commands
  // below — just a faster entry point for the same live, context-preserving
  // switch.
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" };
    }
    const text = event.text.trim();

    if (/^@@main$/i.test(text)) {
      if (!currentMode.activeAgent) {
        ctx.ui.notify("Not currently in agent-mode.", "info");
        return { action: "handled" };
      }
      await restorePreviousAgentState(pi);
      ctx.ui.notify("Back to main. Restored previous model/tools/thinking.", "info");
      return { action: "handled" };
    }

    const match = text.match(/^@@(\S+)\s*([\s\S]*)$/);
    if (!match) {
      return { action: "continue" };
    }
    const [, agentName, rest] = match;
    const result = await switchAgentMode(pi, ctx, agentName);
    if (!result.ok) {
      ctx.ui.notify(result.message, "error");
      return { action: "handled" };
    }
    ctx.ui.notify(`Switched to ${result.displayName} mode.`, "info");
    if (rest.trim()) {
      pi.sendUserMessage(rest.trim());
    }
    return { action: "handled" };
  });

  pi.registerCommand("agent-mode", {
    description: "Switch this session's persona (model/tools/thinking/system-prompt); keeps context",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /agent-mode <agent-name>", "warning");
        return;
      }
      const result = await switchAgentMode(pi, ctx, name);
      if (!result.ok) {
        ctx.ui.notify(result.message, "error");
        return;
      }
      ctx.ui.notify(`Switched to ${result.displayName} mode.`, "info");
    },
  });

  pi.registerCommand("agent-mode-off", {
    description: "Restore the model/tools/thinking active before agent-mode switched",
    handler: async (_args, ctx) => {
      if (!currentMode.activeAgent) {
        ctx.ui.notify("Not currently in agent-mode.", "info");
        return;
      }
      await restorePreviousAgentState(pi);
      ctx.ui.notify("Back to main. Restored previous model/tools/thinking.", "info");
    },
  });
}
