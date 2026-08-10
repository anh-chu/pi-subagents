/**
 * agent-mode.ts — Switch the current session into a fresh session configured
 * as a selected agent (model, tools, thinking, system prompt).
 *
 * Heavy by design: a new session per switch, not a live in-place swap.
 * Reasons:
 *  1. ctx.newSession()/switchSession() (real session replacement) only exist
 *     on ExtensionCommandContext, which the SDK only hands to registerCommand
 *     handlers — there's no live-swap equivalent that's actually safe from
 *     other contexts.
 *  2. Injecting a new persona's system prompt into an existing session's
 *     history without removing the old one just stacks conflicting personas
 *     in context forever (append-only session log, no way to edit/replace a
 *     past entry short of rewinding). A fresh session avoids that entirely.
 *
 * The user manages their own context: nothing is auto-summarized or copied
 * over. /agent-mode's confirm prompt reminds you to hand off anything
 * important yourself (as your first message in the new session). The new
 * session gets a small persistent widget breadcrumb (previous session id +
 * its first user message + its last agent reply) so you can find your way
 * back, and /agent-mode-off switches you to that exact previous session
 * (not a reconstructed guess at prior state).
 *
 * "@@agent_name" / "@@main" are autocomplete expansions, not magic chat
 * triggers: typing "@@" opens a completion list that inserts the real
 * "/agent-mode <name> " or "/agent-mode-off " text into the editor, which
 * then dispatches normally on Enter. This is deliberate, not a workaround
 * we gave up on: the "input" event (which would let an extension intercept
 * "@@name" as already-submitted text) fires *after* the SDK's own
 * slash-command dispatch already ran and was skipped because the text
 * didn't start with "/" (see agent-session.js `prompt()`:
 * `if (text.startsWith("/")) { tryExecuteExtensionCommand(...) }` happens
 * before `emitInput(...)`). By the time an "input" handler sees "@@name",
 * it's too late to route it through the real command dispatcher —
 * registerCommand-only capabilities like ctx.newSession() are simply not
 * reachable from there. Expanding via autocomplete sidesteps this: the
 * actual slash-command text is what gets submitted.
 */

import type { Model } from "@mariozechner/pi-ai";
import type { AutocompleteItem, AutocompleteProvider } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getAgentConfig, getAvailableTypes } from "./agent-types.js";
import { detectEnv } from "./env.js";
import { resolveModel } from "./model-resolver.js";
import { buildAgentPrompt } from "./prompts.js";
import { preloadSkills } from "./skill-loader.js";
import type { AgentConfig, ThinkingLevel } from "./types.js";

export interface AgentModeState {
  /** Name of the agent the user selected, or undefined for no active override. */
  activeAgent?: string;
  /** Display name used in status/toasts. */
  displayName?: string;
  /** Session file to return to via /agent-mode-off. */
  parentSessionFile?: string;
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
 * Model/tools/thinking to apply once the replacement session's OWN extension
 * instance receives "session_start". Session replacement creates a brand-new
 * extension instance with its own `pi` handle; the old `pi`/`ctx` captured
 * in enterAgentMode() is invalidated as soon as the old session tears down,
 * so live calls like pi.setModel() cannot be made from there for the new
 * session. This module-level variable is the one thing that safely crosses
 * the instance boundary: the extension module itself is not re-imported on
 * session replacement, only its default export factory function is invoked
 * again (registering a fresh session_start handler below that reads and
 * clears this).
 */
interface PendingAgentModeApply {
  model?: Model<any>;
  tools?: string[];
  thinking?: ThinkingLevel;
}
let pendingApply: PendingAgentModeApply | undefined;

/**
 * Latest "agent-mode-config" entry not superseded by a later
 * "agent-mode-exit" marker. Scans backward; whichever appears last wins.
 */
export function findLatestAgentModeConfig(entries: any[]): AgentModeEntryData | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.type !== "custom") continue;
    if (e.customType === "agent-mode-exit") return undefined;
    if (e.customType === "agent-mode-config") return e.data as AgentModeEntryData;
  }
  return undefined;
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
  }, {
    context: "agent-mode",
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
 * Apply agent-mode to the current session in place (persistence + live apply).
 * Used by auto-apply and as the setup/apply sequence for manual mode entry.
 * Persists agent-mode-config and agent-mode-instructions entries, applies model/thinking/tools.
 */
async function applyAgentModeToSession(
  pi: ExtensionAPI,
  ctx: { sessionManager: { appendCustomEntry(type: string, data: any): void; appendCustomMessageEntry(type: string, content: any, display: boolean, role?: undefined): void }; cwd: string; modelRegistry?: any },
  config: AgentConfig,
): Promise<{ model: any; tools: string[] }> {
  const displayName = config.displayName ?? config.name;
  const systemPrompt = await buildAgentModePrompt(pi, config, ctx.cwd);

  const modelOrError = config.model
    ? resolveAgentModeModel(config, undefined, ctx.modelRegistry ?? {})
    : undefined;
  const resolvedModel = typeof modelOrError !== "string" && modelOrError ? modelOrError : undefined;
  const tools = await resolveAgentModeTools(pi, config, pi);

  // Persist to session log
  ctx.sessionManager.appendCustomEntry("agent-mode-config", {
    agentName: config.name,
    displayName,
    systemPrompt,
    tools,
  } as AgentModeEntryData);

  ctx.sessionManager.appendCustomMessageEntry(
    "agent-mode-instructions",
    [{ type: "text", text: systemPrompt }],
    false,
    undefined,
  );

  // Apply live
  if (resolvedModel) {
    try {
      await pi.setModel(resolvedModel);
    } catch {
      // Ignore — leave on whatever default model it started with
    }
  }
  if (config.thinking) {
    pi.setThinkingLevel(config.thinking);
  }
  if (tools) {
    pi.setActiveTools(tools);
  }

  // Update module state (no parent session for auto-apply)
  setAgentMode({ activeAgent: config.name, displayName });

  return { model: resolvedModel, tools };
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

  const existing = new Set(allTools);
  return final.filter(t => existing.has(t));
}

export interface AgentModeEntryData {
  agentName: string;
  displayName: string;
  systemPrompt: string;
  tools: string[];
  /** Provider of the resolved model at switch time, for resume rehydration. */
  modelProvider?: string;
  /** Id of the resolved model at switch time, for resume rehydration. */
  modelId?: string;
  thinking?: ThinkingLevel;
  parentSessionFile?: string;
}

function truncate(text: string | undefined, max = 160): string | undefined {
  if (!text) return undefined;
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max)}\u2026` : t;
}

/** Pull the first text block out of a session message entry, if any. */
function messageText(entry: any): string | undefined {
  if (!entry || entry.type !== "message") return undefined;
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b?.type === "text");
    return textBlock?.text;
  }
  return undefined;
}

/**
 * Build the "switched from" breadcrumb shown as a persistent widget in the
 * new session: previous session id, its first user message, its last agent
 * reply. Read-only, informational — never sent to the model.
 */
function buildBreadcrumb(ctx: ExtensionCommandContext): string[] {
  const entries = ctx.sessionManager.getEntries() as any[];
  const firstUser = entries.find(e => e.type === "message" && e.message?.role === "user");
  const lastAgent = [...entries].reverse().find(e => e.type === "message" && e.message?.role === "assistant");
  const lines = [`agent-mode: switched from ${ctx.sessionManager.getSessionId()}`];
  const firstText = truncate(messageText(firstUser));
  const lastText = truncate(messageText(lastAgent));
  if (firstText) lines.push(`\u2192 ${firstText}`);
  if (lastText) lines.push(`\u2190 ${lastText}`);
  lines.push("/agent-mode-off to return");
  return lines;
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
    `This starts a brand-new session configured as "${agentName}". Nothing carries over automatically — ` +
      `if there's anything to hand off, say so as your first message once switched. Continue?`,
  );
  if (!confirm) {
    ctx.ui.notify("Agent-mode switch cancelled.", "info");
    return;
  }

  const displayName = config.displayName ?? config.name;
  const systemPrompt = await buildAgentModePrompt(pi, config, ctx.cwd);

  // Resolve model, tools, and the breadcrumb BEFORE calling ctx.newSession().
  // The setup() callback below runs after the old session has already been
  // torn down (teardownCurrent), which invalidates the pre-replacement `pi` /
  // `ctx` handles. Calling anything session-bound on them from inside setup()
  // throws synchronously, which the host treats as a fatal runtime error and
  // immediately process.exit()s the whole TUI. Precompute here instead and
  // just close over the plain results.
  const modelOrError = config.model
    ? resolveAgentModeModel(config, undefined, ctx.modelRegistry as any)
    : undefined;
  const resolvedModel = typeof modelOrError !== "string" && modelOrError ? modelOrError : undefined;
  const tools = await resolveAgentModeTools(pi, config, pi);
  const breadcrumb = buildBreadcrumb(ctx);
  const parentSessionFile = ctx.sessionManager.getSessionFile();

  // setup(sessionManager) can only persist session-log entries — it cannot
  // switch the live model/tools/thinking (see PendingAgentModeApply doc).
  // Stash what to apply and let the new instance's own "session_start"
  // handler (registered in registerAgentModeCommands) apply it via its own
  // valid `pi`.
  pendingApply = { model: resolvedModel, tools, thinking: config.thinking };

  const result = await ctx.newSession({
    parentSession: parentSessionFile,
    setup: async (sessionManager) => {
      sessionManager.appendCustomEntry("agent-mode-config", {
        agentName: config.name,
        displayName,
        systemPrompt,
        tools,
        modelProvider: resolvedModel?.provider,
        modelId: resolvedModel?.id,
        thinking: config.thinking,
        parentSessionFile,
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
      replacementCtx.ui.setWidget("agent-mode", breadcrumb);
      replacementCtx.ui.setStatus("agent-mode-status", `Agent: ${displayName}`);
      replacementCtx.ui.notify(`Switched to ${displayName} mode. New session started.`, "info");
    },
  });

  if (result.cancelled) {
    pendingApply = undefined;
    ctx.ui.notify("Agent-mode switch cancelled.", "info");
    return;
  }

  setAgentMode({ activeAgent: config.name, displayName, parentSessionFile });
}

/** Register /agent-mode, /agent-mode-off, and the "@@" autocomplete shorthand. */
export function registerAgentModeCommands(pi: ExtensionAPI): void {
  // Clears the breadcrumb banner as soon as the user sends their first prompt
  // in agent-mode. (Idempotent on later turns — clearing an already-cleared widget is harmless.)
  pi.on("before_agent_start", async (_event, ctx) => {
    if (currentMode.activeAgent) {
      ctx.ui.setWidget("agent-mode", undefined);
    }
  });

  // Applies a pending model/tools/thinking switch queued by enterAgentMode()
  // just before it called ctx.newSession(). Runs once per fresh instance,
  // using this instance's own (valid) pi, then clears the flag.
  // Also auto-applies default agent mode on fresh new sessions and rehydrates
  // agent-mode sessions on resume/reload/fork.
  pi.on("session_start", async (event, ctx) => {
    // 1. Apply pending model/tools/thinking (from enterAgentMode)
    if (pendingApply) {
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
      return;
    }

    // 2. Auto-apply default agent mode on fresh new sessions
    const reason = event?.reason;
    const isNewSession = reason === "new" || reason === "startup";
    if (isNewSession) {
      const entries = (ctx?.sessionManager?.getEntries?.() as any[]) ?? [];
      // Check for existing config in both old and new entry formats
      const hasExistingConfig = findLatestAgentModeConfig(entries) !== undefined ||
        entries.some((e: any) => e?.type === "agent-mode-config");

      if (!hasExistingConfig) {
        const candidates = getAvailableTypes()
          .map(name => ({ name, config: getAgentConfig(name) }))
          .filter(({ config }) => config?.defaultMode === true)
          .sort(({ name: a }, { name: b }) => a.localeCompare(b));

        if (candidates.length > 0) {
          const { config } = candidates[0];
          if (config) {
            try {
              await applyAgentModeToSession(pi, ctx as any, config);
              if (ctx?.ui?.notify) {
                ctx.ui.notify(`Auto-applied agent mode: ${config.displayName ?? config.name}`, "info");
              }
            } catch (err) {
              console.error("agent-mode auto-apply failed:", err);
            }
          }
        }
      }
      return;
    }

    // 3. Rehydrate agent-mode when resumed/reloaded/forked
    if (reason !== "resume" && reason !== "reload" && reason !== "fork") return;
    if (currentMode.activeAgent) return;
    const data = findLatestAgentModeConfig(ctx.sessionManager.getEntries() as any[]);
    if (!data) return;

    setAgentMode({
      activeAgent: data.agentName,
      displayName: data.displayName,
      parentSessionFile: data.parentSessionFile,
    });
    ctx.ui.setStatus("agent-mode-status", `Agent: ${data.displayName}`);
    if (data.modelProvider && data.modelId) {
      const model = ctx.modelRegistry.find(data.modelProvider, data.modelId);
      if (model) {
        try {
          const ok = await pi.setModel(model);
          if (!ok) {
            pi.appendEntry("agent-mode-warning", { message: `No API key for ${data.modelProvider}/${data.modelId}` });
          }
        } catch {
          // Ignore — leave the session on whatever model it resumed with.
        }
      } else {
        pi.appendEntry("agent-mode-warning", {
          message: `Model ${data.modelProvider}/${data.modelId} not available; keeping current model`,
        });
      }
    }
    if (data.thinking) {
      pi.setThinkingLevel(data.thinking);
    }
    if (data.tools) {
      pi.setActiveTools(data.tools);
    }
  });

  // "@@agent_name" / "@@main" autocomplete: typing "@@" opens a completion
  // list; accepting an item inserts the real "/agent-mode <name> " or
  // "/agent-mode-off " text into the editor (does not submit by itself —
  // Enter still dispatches it as a normal slash command). See the module
  // doc comment for why this can't be a direct chat-text trigger instead.
  pi.on("session_start", async (_event, ctx) => {
    if (currentMode.activeAgent) {
      ctx.ui.setStatus("agent-mode-status", `Agent: ${currentMode.displayName}`);
    }
    ctx.ui.addAutocompleteProvider((current: AutocompleteProvider): AutocompleteProvider => ({
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const line = lines[cursorLine] ?? "";
        const before = line.slice(0, cursorCol);
        const match = before.match(/@@(\S*)$/);
        if (!match) return current.getSuggestions(lines, cursorLine, cursorCol, options);

        const query = match[1].toLowerCase();
        const items: AutocompleteItem[] = [];
        if ("main".startsWith(query)) {
          items.push({ value: "main", label: "@@main", description: "Switch back to the previous session" });
        }
        for (const name of getAvailableTypes()) {
          if (!name.toLowerCase().includes(query)) continue;
          const config = getAgentConfig(name);
          items.push({ value: name, label: `@@${name}`, description: config?.displayName ?? config?.name ?? name });
        }
        if (items.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);
        return { items, prefix: `@@${match[1]}` };
      },
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        if (!prefix.startsWith("@@")) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);

        const line = lines[cursorLine] ?? "";
        const before = line.slice(0, cursorCol);
        const at = before.lastIndexOf(prefix);
        if (at === -1) return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);

        const replacement = item.value === "main" ? "/agent-mode-off " : `/agent-mode ${item.value} `;
        const newLine = line.slice(0, at) + replacement + line.slice(cursorCol);
        const newLines = [...lines];
        newLines[cursorLine] = newLine;
        return { lines: newLines, cursorLine, cursorCol: at + replacement.length };
      },
      shouldTriggerFileCompletion: current.shouldTriggerFileCompletion?.bind(current),
    }));
  });

  // Defensive cleanup: clear status indicator when session shuts down while in agent-mode.
  pi.on("session_shutdown", async (_event, ctx) => {
    if (currentMode.activeAgent) {
      ctx.ui.setStatus("agent-mode-status", undefined);
    }
  });

  pi.registerCommand("agent-mode", {
    description: "Switch to a fresh session configured as a subagent",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /agent-mode <agent-name> (or type @@ for a picker)", "warning");
        return;
      }
      await enterAgentMode(pi, ctx, name);
    },
  });

  pi.registerCommand("agent-mode-off", {
    description: "Switch back to the session you were in before agent-mode",
    handler: async (_args, ctx) => {
      if (!currentMode.activeAgent) {
        ctx.ui.notify("Not currently in agent-mode.", "info");
        return;
      }
      // If no parentSessionFile (e.g., auto-applied mode), just clear mode and notify
      if (!currentMode.parentSessionFile) {
        ctx.ui.setStatus("agent-mode-status", undefined);
        ctx.ui.setWidget("agent-mode", undefined);
        clearAgentMode();
        ctx.ui.notify("Agent-mode cleared. Continuing in this session.", "info");
        return;
      }
      const target = currentMode.parentSessionFile;
      // Persist an exit marker in THIS (agent) session's log before switching
      // away, so a later resume of this session does not rehydrate agent-mode.
      pi.appendEntry("agent-mode-exit", {});
      const result = await ctx.switchSession(target, {
        withSession: async (replacementCtx) => {
          replacementCtx.ui.setStatus("agent-mode-status", undefined);
          replacementCtx.ui.setWidget("agent-mode", undefined);
          replacementCtx.ui.notify("Back to your previous session.", "info");
        },
      });
      if (result.cancelled) {
        ctx.ui.notify("Switch back cancelled.", "info");
        return;
      }
      clearAgentMode();
    },
  });
}
