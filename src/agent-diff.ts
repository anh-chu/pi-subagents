/**
 * agent-diff.ts — Compare a user's replace-mode override against its bundled default.
 *
 * Read-only: no metadata, no state, no side effects.
 */

import { BUILTIN_TOOL_NAMES } from "./agent-types.js";
import { DEFAULT_AGENTS } from "./default-agents.js";
import type { AgentConfig } from "./types.js";

/** A single field-level difference between a local override and its bundled default. */
export interface DiffEntry {
  /** Internal NormalizedConfig key (e.g. "systemPrompt") — used by agent-field-revert.ts. */
  key: keyof NormalizedConfig;
  field: string;
  local: string;
  default: string;
}

/** Normalized snapshot of a config's behavior-relevant fields. */
interface NormalizedConfig {
  builtinToolNames: string;
  description: string;
  displayName: string;
  systemPrompt: string;
  model: string | undefined;
  thinking: string | undefined;
  maxTurns: number | undefined;
  extensions: string;
  skills: string;
  extSelectors: string | undefined;
  inheritContext: string | undefined;
  runInBackground: string | undefined;
  memory: string | undefined;
  isolation: string | undefined;
  recoverOnAbort: string | undefined;
  disallowedTools: string | undefined;
  contract: string | undefined;
}

/**
 * Normalize a config's behavior-relevant fields so YAML formatting or
 * omitted-equals-default fields do not create false positives.
 *
 * All values are stringified for comparison and display; no raw objects.
 */
function normalize(cfg: AgentConfig): NormalizedConfig {
  const extSel = cfg.extSelectors;
  const fmtArr = (arr: string[] | undefined) => arr?.length ? [...arr].sort().join(", ") : undefined;
  const fmtBool = (v: boolean | undefined) => v === undefined ? undefined : String(v);
  return {
    builtinToolNames: [...(cfg.builtinToolNames ?? BUILTIN_TOOL_NAMES)].sort().join(", "),
    description: cfg.description,
    displayName: cfg.displayName ?? cfg.name,
    systemPrompt: cfg.systemPrompt,
    model: cfg.model ?? undefined,
    thinking: cfg.thinking ?? undefined,
    maxTurns: cfg.maxTurns ?? undefined,
    extensions: JSON.stringify(cfg.extensions ?? true),
    skills: JSON.stringify(cfg.skills ?? true),
    extSelectors: fmtArr(extSel),
    inheritContext: fmtBool(cfg.inheritContext),
    runInBackground: fmtBool(cfg.runInBackground),
    memory: cfg.memory ?? undefined,
    isolation: cfg.isolation ?? undefined,
    recoverOnAbort: fmtBool(cfg.recoverOnAbort),
    disallowedTools: fmtArr(cfg.disallowedTools),
    contract: cfg.contract ? JSON.stringify(cfg.contract) : undefined,
  };
}

/** Human-readable label for a config field. */
const FIELD_LABELS: Record<keyof NormalizedConfig, string> = {
  builtinToolNames: "Tools",
  description: "Description",
  displayName: "Display name",
  systemPrompt: "System prompt",
  model: "Model",
  thinking: "Thinking",
  maxTurns: "Max turns",
  extensions: "Extensions",
  skills: "Skills",
  extSelectors: "Extension selectors",
  inheritContext: "Inherit context",
  runInBackground: "Run in background",
  memory: "Memory",
  isolation: "Isolation",
  recoverOnAbort: "Recover on abort",
  disallowedTools: "Disallowed tools",
  contract: "Contract",
};

/**
 * Format the systemPrompt diff: the actual differing lines (common prefix
 * and suffix trimmed away), capped so huge prompts don't flood the view.
 * Never dumps the full prompt body — only the part that actually changed.
 */
function fmtPromptDiff(local: string, def: string): string {
  const a = local.split("\n");
  const b = def.split("\n");

  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const removed = b.slice(start, endB + 1); // default-only lines
  const added = a.slice(start, endA + 1); // override-only lines
  const MAX = 8;

  const out: string[] = [`@@ from line ${start + 1} (local: ${local.length} chars, default: ${def.length} chars)`];
  for (const l of removed.slice(0, MAX)) out.push(`  - ${l}`);
  if (removed.length > MAX) out.push(`  ... (${removed.length - MAX} more removed line(s))`);
  for (const l of added.slice(0, MAX)) out.push(`  + ${l}`);
  if (added.length > MAX) out.push(`  ... (${added.length - MAX} more added line(s))`);

  return out.join("\n");
}

/** Format a scalar field value for display — omit "undefined". */
function fmtVal(v: string | number | boolean | undefined): string {
  if (v === undefined) return "(not set)";
  return String(v);
}

/**
 * Return field-level differences between a replace-mode override and its
 * bundled default, or null when identical / not an applicable override.
 *
 * Same gates as differsFromDefault: excludes isDefault, append-mode,
 * disabled stubs, custom agents with no matching default.
 */
export function diffFromDefault(cfg: AgentConfig): DiffEntry[] | null {
  if (cfg.isDefault) return null;
  if (cfg.promptMode !== "replace") return null;
  if (cfg.enabled === false) return null;
  if (cfg.source !== "project" && cfg.source !== "global") return null;

  const def = DEFAULT_AGENTS.get(cfg.name);
  if (!def) return null;

  const a = normalize(cfg);
  const b = normalize(def);

  const entries: DiffEntry[] = [];

  const compare = (field: keyof NormalizedConfig) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return;
    if (field === "systemPrompt") {
      entries.push({ key: field, field: FIELD_LABELS[field], local: fmtPromptDiff(av as string, bv as string), default: "" });
    } else {
      entries.push({ key: field, field: FIELD_LABELS[field], local: fmtVal(av), default: fmtVal(bv) });
    }
  };

  compare("description");
  compare("displayName");
  compare("model");
  compare("thinking");
  compare("maxTurns");
  compare("builtinToolNames");
  compare("extensions");
  compare("skills");
  compare("extSelectors");
  compare("inheritContext");
  compare("runInBackground");
  compare("memory");
  compare("isolation");
  compare("recoverOnAbort");
  compare("disallowedTools");
  compare("contract");
  compare("systemPrompt"); // last — longest output

  return entries.length > 0 ? entries : null;
}

/**
 * Returns true when `cfg` is a replace-mode override of a bundled default
 * and its behavior-relevant fields differ from that default.
 *
 * Derived from diffFromDefault so the two cannot drift.
 */
export function differsFromDefault(cfg: AgentConfig): boolean {
  return diffFromDefault(cfg) !== null;
}
