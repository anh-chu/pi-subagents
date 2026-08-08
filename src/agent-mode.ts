/**
 * agent-mode.ts — Switch the user's current session into a fresh session that
 * behaves like a selected agent.
 *
 * This is the "heavy" version of OpenCode-style agent switching: it creates a
 * brand-new session with the agent's full configuration (system prompt, model,
 * thinking level, tool set). The previous conversation is not carried over.
 */

import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getAgentConfig } from "./agent-types.js";
import { detectEnv } from "./env.js";
import { resolveModel } from "./model-resolver.js";
import { buildAgentPrompt } from "./prompts.js";
import { preloadSkills } from "./skill-loader.js";
import type { AgentConfig, ThinkingLevel } from "./types.js";

/**
 * Model/tools/thinking to apply once the replacement session's OWN extension
 * instance receives "session_start". Session replacement creates a brand-new
 * extension instance with its own `pi` handle; the old `pi`/`ctx` captured
 * in enterAgentMode() is invalidated as soon as the old session tears down
 * (see enterAgentMode for details), so live calls like pi.setModel() cannot
 * be made from there for the new session. This module-level variable is the
 * one thing that safely crosses the instance boundary: the extension module
 * itself is not re-imported on session replacement, only its default export
 * factory function is invoked again (registering a fresh session_start
 * handler below that reads and clears this).
 */
interface PendingAgentModeApply {
  model?: Model<any>;
  tools?: string[];
  thinking?: ThinkingLevel;
}
let pendingApply: PendingAgentModeApply | undefined;

export interface AgentModeState {
  /** Name of the agent the user selected, or undefined for no active override. */
  activeAgent?: string;
  /** Display name used in status/toasts. */
  displayName?: string;
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

/** Build the system prompt for the new agent-mode session. */
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
 * Resolve the effective model for an agent-mode session.
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
 * Compute the tool allowlist for the agent-mode session.
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

/**
 * Enter agent-mode: create a fresh session and configure it to behave like the
 * selected agent. Warns the user that this is a brand-new session.
 */
export async function enterAgentMode(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  agentName: string,
): Promise<void> {
  const config = getAgentConfig(agentName);
  if (!config) {
    ctx.ui.notify(`Unknown agent type: "${agentName}"`, "error");
    return;
  }
  if (config.enabled === false) {
    ctx.ui.notify(`Agent "${agentName}" is disabled.`, "warning");
    return;
  }

  const confirm = await ctx.ui.confirm(
    "Switch to agent-mode session?",
    `This creates a brand-new session using the "${agentName}" agent configuration. ` +
      `Your current conversation will NOT be carried over. Continue?`,
  );
  if (!confirm) {
    ctx.ui.notify("Agent-mode switch cancelled.", "info");
    return;
  }

  const displayName = config.displayName ?? config.name;
  const systemPrompt = await buildAgentModePrompt(pi, config, ctx.cwd);

  // Resolve model and tools BEFORE calling ctx.newSession(). The setup()
  // callback below runs after the old session has already been torn down
  // (teardownCurrent), which invalidates the pre-replacement `pi` / `ctx`
  // handles. Calling anything session-bound on them from inside setup()
  // throws synchronously, which the host treats as a fatal runtime error
  // and immediately process.exit()s the whole TUI. Precompute here instead
  // and just close over the plain results inside setup().
  const modelOrError = config.model
    ? resolveAgentModeModel(config, undefined, ctx.modelRegistry as any)
    : undefined;
  const resolvedModel = typeof modelOrError !== "string" && modelOrError ? modelOrError : undefined;
  const tools = await resolveAgentModeTools(pi, config, pi);

  // setup(sessionManager) can only persist session-log entries — it cannot
  // actually switch the live model/tools/thinking, because by the time it
  // runs the new session's AgentSession (and its default model) already
  // exists. pi.setModel()/setActiveTools()/setThinkingLevel() are the live
  // APIs, but they only exist on the per-instance `pi`, and the replacement
  // session gets a brand-new extension instance with its own `pi` — this
  // old one is invalidated. So we stash what to apply here and let the new
  // instance's own "session_start" handler (registered in
  // registerAgentModeCommands) apply it via its own valid `pi`.
  pendingApply = { model: resolvedModel, tools, thinking: config.thinking };

  const result = await ctx.newSession({
    parentSession: ctx.sessionManager.getSessionFile(),
    setup: async (sessionManager) => {
      // Persist a config marker for introspection. Model/thinking/tool
      // entries themselves are written by pi.setModel()/setThinkingLevel()
      // when the "session_start" handler applies pendingApply, so they
      // aren't duplicated here.
      sessionManager.appendCustomEntry("agent-mode-config", {
        agentName: config.name,
        displayName,
        systemPrompt,
        tools,
      } as AgentModeEntryData);

      // Seed the conversation with the agent's system prompt so the first user
      // turn sees it. Stored as a custom message entry with display=false.
      sessionManager.appendCustomMessageEntry(
        "agent-mode-instructions",
        [{ type: "text", text: systemPrompt }],
        false,
        undefined,
      );
    },
    withSession: async (replacementCtx) => {
      replacementCtx.ui.setEditorText("");
      replacementCtx.ui.notify(`Switched to ${displayName} mode. New session started.`, "info");
    },
  });

  if (result.cancelled) {
    pendingApply = undefined;
    ctx.ui.notify("Agent-mode switch cancelled.", "info");
    return;
  }

  setAgentMode({ activeAgent: config.name, displayName });
}

export interface AgentModeEntryData {
  agentName: string;
  displayName: string;
  systemPrompt: string;
  tools: string[];
}

/** Register /agent-mode and /agent-mode-off commands. */
export function registerAgentModeCommands(pi: ExtensionAPI): void {
  // Applies a pending model/tools/thinking switch queued by enterAgentMode()
  // just before it called ctx.newSession(). Runs once per fresh instance,
  // using this instance's own (valid) pi, then clears the flag.
  pi.on("session_start", async () => {
    if (!pendingApply) return;
    const { model, tools, thinking } = pendingApply;
    pendingApply = undefined;
    if (model) {
      try {
        const ok = await pi.setModel(model);
        if (!ok) {
          pi.appendEntry("agent-mode-warning", { message: `No API key for ${model.provider}/${model.id}` });
        }
      } catch {
        // Ignore — leave the session on whatever default model it started with.
      }
    }
    if (thinking) {
      pi.setThinkingLevel(thinking);
    }
    if (tools) {
      pi.setActiveTools(tools);
    }
  });

  pi.registerCommand("agent-mode", {
    description: "Switch to a fresh session configured as a subagent",
    handler: async (args, ctx) => {
      if (!(ctx as any).hasUI) {
        ctx.ui.notify("agent-mode requires interactive mode", "error");
        return;
      }
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /agent-mode <agent-name>", "warning");
        return;
      }
      await enterAgentMode(pi, ctx, name);
    },
  });

  pi.registerCommand("agent-mode-off", {
    description: "Clear agent-mode state (informational — session is already fresh)",
    handler: async (_args, ctx) => {
      clearAgentMode();
      ctx.ui.notify("Agent-mode state cleared. Start a new thread or /reload to return to default.", "info");
    },
  });
}
