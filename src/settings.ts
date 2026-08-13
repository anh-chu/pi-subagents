// Persistence for pi-subagents operational settings.
// - Global:  ~/.pi/agent/subagents.json (via getAgentDir()) — manual defaults, never written here
// - Project: <cwd>/.pi/subagents.json — written by /agents → Settings; overrides global on load

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { JoinMode } from "./types.js";

export interface SubagentsSettings {
  maxConcurrent?: number;
  /**
   * 0 = unlimited — the extension's single source of truth for that convention:
   * `normalizeMaxTurns()` in agent-runner.ts treats 0 → `undefined`, and the
   * `/agents` → Settings input prompt explicitly says "0 = unlimited".
   */
  defaultMaxTurns?: number;
  graceTurns?: number;
  defaultJoinMode?: JoinMode;
  /**
   * Master switch for the schedule subagent feature. Defaults to `true`.
   * When `false`: the `Agent` tool's `schedule` param + its guideline are
   * stripped from the tool spec at registration (zero LLM-context cost), the
   * scheduler doesn't bind to the session, and the `/agents → Scheduled jobs`
   * menu entry is hidden. Schema-level removal applies at extension load
   * (next pi session); runtime menu/runtime-fire short-circuit is immediate.
   */
  schedulingEnabled?: boolean;
  /**
   * When true, the three built-in default agents (general-purpose, Explore, Plan)
   * are not registered at startup. User-defined agents from .pi/agents/*.md are
   * completely unaffected — only the hardcoded DEFAULT_AGENTS are suppressed.
   * Defaults to false.
   */
  disableDefaultAgents?: boolean;
  /**
   * Which Agent tool description the LLM sees. "full" (default) is the rich
   * Claude Code-style prompt; "compact" is a ~75% smaller version (one-line
   * agent type list, terse usage notes) for small/local models where tool-spec
   * tokens are expensive; "custom" reads `.pi/agent-tool-description.md`
   * (project, falling back to `<agentDir>/agent-tool-description.md`) with
   * `{{placeholder}}` substitution — a missing/empty file falls back to "full".
   * The mode is read once at tool registration — changing it applies on the
   * next pi session.
   */
  toolDescriptionMode?: ToolDescriptionMode;
  /**
   * Global default for a subagent's `extensions:` when its frontmatter omits the
   * field. Same shape and loader-level semantics as the per-agent `extensions:`
   * field: `true` = all extensions, `false` = none, `string[]` = allowlist of
   * extension names/paths. An explicit per-agent `extensions:` always wins.
   * Omitted here → agents that omit the field load all extensions (legacy default).
   */
  defaultExtensions?: true | string[] | false;
  /**
   * Like `defaultExtensions` but for `skills:`. Used when an agent's frontmatter
   * omits `skills:`. Explicit per-agent `skills:` (incl. `false`) wins.
   * Omitted here → agents that omit the field load all skills (legacy default).
   */
  defaultSkills?: true | string[] | false;
  /**
   * Forced extensions always loaded on top of the agent's resolved set, even
   * when the agent's frontmatter explicitly says `extensions: false`. Array of
   * extension names/paths (same entry shape as `defaultExtensions` list entries).
   * Applied additively after base resolution; deduped by canonical form.
   * Global + project arrays UNION across settings layers (forced accumulates).
   */
  forcedExtensions?: string[];
  /**
   * Forced skills always preloaded on top of the agent's resolved skills, even
   * when the agent's frontmatter explicitly says `skills: false`. Array of
   * skill names. Applied additively after base resolution; deduped by name.
   * Global + project arrays UNION across settings layers (forced accumulates).
   */
  forcedSkills?: string[];
}

export type ToolDescriptionMode = "full" | "compact" | "custom";

/** Setter hooks used by applySettings to wire persisted values into in-memory state. */
export interface SettingsAppliers {
  setMaxConcurrent: (n: number) => void;
  setDefaultMaxTurns: (n: number) => void;
  setGraceTurns: (n: number) => void;
  setDefaultJoinMode: (mode: JoinMode) => void;
  setSchedulingEnabled: (b: boolean) => void;
  setDisableDefaultAgents: (b: boolean) => void;
  setToolDescriptionMode: (mode: ToolDescriptionMode) => void;
  setDefaultExtensions: (v: true | string[] | false) => void;
  setDefaultSkills: (v: true | string[] | false) => void;
  setForcedExtensions: (v: string[] | undefined) => void;
  setForcedSkills: (v: string[] | undefined) => void;
}

/** Emit callback — a subset of `pi.events.emit` to keep helpers testable. */
export type SettingsEmit = (event: string, payload: unknown) => void;

const VALID_JOIN_MODES: ReadonlySet<string> = new Set<JoinMode>(["async", "group", "smart"]);
const VALID_TOOL_DESCRIPTION_MODES: ReadonlySet<string> = new Set<ToolDescriptionMode>(["full", "compact", "custom"]);

// Sanity ceilings — prevent hand-edited configs from asking for values that
// make no operational sense (e.g. 1e6 concurrent subagents). Permissive enough
// that any realistic power-user setting passes through.
const MAX_CONCURRENT_CEILING = 1024;
const MAX_TURNS_CEILING = 10_000;
const GRACE_TURNS_CEILING = 1_000;

/** Drop fields that don't match the expected shape. Silent — garbage becomes absent. */
function sanitize(raw: unknown): SubagentsSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SubagentsSettings = {};
  if (
    Number.isInteger(r.maxConcurrent) &&
    (r.maxConcurrent as number) >= 1 &&
    (r.maxConcurrent as number) <= MAX_CONCURRENT_CEILING
  ) {
    out.maxConcurrent = r.maxConcurrent as number;
  }
  if (
    Number.isInteger(r.defaultMaxTurns) &&
    (r.defaultMaxTurns as number) >= 0 &&
    (r.defaultMaxTurns as number) <= MAX_TURNS_CEILING
  ) {
    out.defaultMaxTurns = r.defaultMaxTurns as number;
  }
  if (
    Number.isInteger(r.graceTurns) &&
    (r.graceTurns as number) >= 1 &&
    (r.graceTurns as number) <= GRACE_TURNS_CEILING
  ) {
    out.graceTurns = r.graceTurns as number;
  }
  if (typeof r.defaultJoinMode === "string" && VALID_JOIN_MODES.has(r.defaultJoinMode)) {
    out.defaultJoinMode = r.defaultJoinMode as JoinMode;
  }
  if (typeof r.schedulingEnabled === "boolean") {
    out.schedulingEnabled = r.schedulingEnabled;
  }
  if (typeof r.disableDefaultAgents === "boolean") {
    out.disableDefaultAgents = r.disableDefaultAgents;
  }
  if (typeof r.toolDescriptionMode === "string" && VALID_TOOL_DESCRIPTION_MODES.has(r.toolDescriptionMode)) {
    out.toolDescriptionMode = r.toolDescriptionMode as ToolDescriptionMode;
  }
  // defaultExtensions/defaultSkills mirror the per-agent `extensions:`/`skills:` shape:
  // boolean, or a list of non-empty strings (names/paths). Anything else is dropped.
  if (typeof r.defaultExtensions === "boolean") {
    out.defaultExtensions = r.defaultExtensions;
  } else if (Array.isArray(r.defaultExtensions)) {
    const list = r.defaultExtensions.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
    if (list.length > 0) out.defaultExtensions = list;
  }
  if (typeof r.defaultSkills === "boolean") {
    out.defaultSkills = r.defaultSkills;
  } else if (Array.isArray(r.defaultSkills)) {
    const list = r.defaultSkills.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
    if (list.length > 0) out.defaultSkills = list;
  }
  // forced* are string[]-only (no boolean/false form). Arrays of non-empty strings.
  out.forcedExtensions = sanitizeForcedArray(r.forcedExtensions);
  out.forcedSkills = sanitizeForcedArray(r.forcedSkills);
  return out;
}

/** Sanitize a forced* array: keep only non-empty trimmed strings; drop empty arrays. */
function sanitizeForcedArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: string[] = [];
  for (const e of raw) {
    if (typeof e === "string") {
      const t = e.trim();
      if (t.length > 0) list.push(t);
    }
  }
  return list.length > 0 ? list : undefined;
}

/** Union two string arrays preserving insertion order, de-duping exact duplicates. */
function unionStrings(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...(a ?? []), ...(b ?? [])]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.length > 0 ? out : undefined;
}

function globalPath(): string {
  return join(getAgentDir(), "subagents.json");
}

function projectPath(cwd: string): string {
  return join(cwd, ".pi", "subagents.json");
}

/**
 * Read a settings file. Missing file is silent (returns `{}`). A file that
 * exists but can't be parsed emits a warning to stderr so users aren't
 * silently reverted to defaults — and still returns `{}` so startup proceeds.
 */
function readSettingsFile(path: string): SubagentsSettings {
  if (!existsSync(path)) return {};
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[pi-subagents] Ignoring malformed settings at ${path}: ${reason}`);
    return {};
  }
}

/** Load merged settings: scalar keys are project-overrides-global; `forced*`
 * arrays UNION across layers (forced accumulates, never silently erased).
 */
export function loadSettings(cwd: string = process.cwd()): SubagentsSettings {
  const global = readSettingsFile(globalPath());
  const project = readSettingsFile(projectPath(cwd));
  const merged: SubagentsSettings = { ...global, ...project };
  // forced* union across global+project (forced means forced across settings layers too)
  const forcedExt = unionStrings(global.forcedExtensions, project.forcedExtensions);
  if (forcedExt) merged.forcedExtensions = forcedExt;
  const forcedSkl = unionStrings(global.forcedSkills, project.forcedSkills);
  if (forcedSkl) merged.forcedSkills = forcedSkl;
  return merged;
}

/**
 * Write project-local settings. Global is never touched from code.
 * Returns `true` on success, `false` if the write (or mkdir) failed so the
 * caller can surface a warning — persistence isn't fatal but isn't silent.
 */
export function saveSettings(s: SubagentsSettings, cwd: string = process.cwd()): boolean {
  const path = projectPath(cwd);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(s, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Apply persisted settings to the in-memory state via caller-supplied setters. */
export function applySettings(s: SubagentsSettings, appliers: SettingsAppliers): void {
  if (typeof s.maxConcurrent === "number") appliers.setMaxConcurrent(s.maxConcurrent);
  if (typeof s.defaultMaxTurns === "number") appliers.setDefaultMaxTurns(s.defaultMaxTurns);
  if (typeof s.graceTurns === "number") appliers.setGraceTurns(s.graceTurns);
  if (s.defaultJoinMode) appliers.setDefaultJoinMode(s.defaultJoinMode);
  if (typeof s.schedulingEnabled === "boolean") appliers.setSchedulingEnabled(s.schedulingEnabled);
  if (typeof s.disableDefaultAgents === "boolean") appliers.setDisableDefaultAgents(s.disableDefaultAgents);
  if (s.toolDescriptionMode) appliers.setToolDescriptionMode(s.toolDescriptionMode);
  if (s.defaultExtensions !== undefined) appliers.setDefaultExtensions(s.defaultExtensions);
  if (s.defaultSkills !== undefined) appliers.setDefaultSkills(s.defaultSkills);
  if (s.forcedExtensions !== undefined) appliers.setForcedExtensions(s.forcedExtensions);
  if (s.forcedSkills !== undefined) appliers.setForcedSkills(s.forcedSkills);
}

/**
 * Format the user-facing toast for a settings mutation. Pure function —
 * routes the success/failure of `saveSettings` into the right message + level
 * so the UI layer (index.ts) stays a thin wire between input and notification.
 */
export function persistToastFor(
  successMsg: string,
  persisted: boolean,
): { message: string; level: "info" | "warning" } {
  return persisted
    ? { message: successMsg, level: "info" }
    : { message: `${successMsg} (session only; failed to persist)`, level: "warning" };
}

/**
 * Load merged settings, apply them to in-memory state, and emit the
 * `subagents:settings_loaded` lifecycle event. Returns the loaded settings so
 * callers can log/inspect. Extension init wires this once.
 */
export function applyAndEmitLoaded(
  appliers: SettingsAppliers,
  emit: SettingsEmit,
  cwd: string = process.cwd(),
): SubagentsSettings {
  const settings = loadSettings(cwd);
  applySettings(settings, appliers);
  emit("subagents:settings_loaded", { settings });
  return settings;
}

/**
 * Persist a settings snapshot, emit the `subagents:settings_changed` event
 * (regardless of persist outcome so listeners see the in-memory change), and
 * return the toast the UI should display. Event payload carries the `persisted`
 * flag so listeners can react to write failures.
 */
export function saveAndEmitChanged(
  snapshot: SubagentsSettings,
  successMsg: string,
  emit: SettingsEmit,
  cwd: string = process.cwd(),
): { message: string; level: "info" | "warning" } {
  const persisted = saveSettings(snapshot, cwd);
  emit("subagents:settings_changed", { settings: snapshot, persisted });
  return persistToastFor(successMsg, persisted);
}
