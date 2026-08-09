/**
 * agent-field-revert.ts — Revert a single field of a replace-mode agent
 * override .md file back to its bundled default value.
 *
 * Operates on raw frontmatter/body text so all other overrides in the file
 * are left untouched. Companion to agent-diff.ts, which only inspects.
 */

import { BUILTIN_TOOL_NAMES } from "./agent-types.js";
import type { AgentConfig } from "./types.js";

/** Maps a NormalizedConfig field key (see agent-diff.ts) to its frontmatter key. */
const FRONTMATTER_KEYS: Partial<Record<string, string>> = {
  description: "description",
  displayName: "display_name",
  model: "model",
  thinking: "thinking",
  maxTurns: "max_turns",
  extensions: "extensions",
  skills: "skills",
  inheritContext: "inherit_context",
  runInBackground: "run_in_background",
  memory: "memory",
  isolation: "isolation",
  recoverOnAbort: "recover_on_abort",
  disallowedTools: "disallowed_tools",
};

const SAFE_BARE_VALUE = /^[A-Za-z0-9_./-]+$/;

/** Format a scalar for a frontmatter line, quoting only when needed. */
function yamlScalar(v: string | number | boolean): string {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return SAFE_BARE_VALUE.test(v) ? v : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Serialize the combined `tools:` frontmatter field from builtin names + ext selectors. */
function serializeTools(builtin: string[], extSelectors: string[] | undefined): string | undefined {
  const isFullBuiltin =
    builtin.length === BUILTIN_TOOL_NAMES.length && new Set(builtin).size === new Set(BUILTIN_TOOL_NAMES).size;
  if (extSelectors === undefined && isFullBuiltin) return undefined; // omit -> legacy "inherit everything"
  const parts = isFullBuiltin ? ["*"] : [...builtin];
  if (extSelectors) parts.push(...extSelectors);
  return parts.join(", ");
}

/** Replace or remove a single `key: value` line inside the frontmatter block. */
function setFrontmatterField(content: string, key: string, value: string | undefined): string {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return content; // no frontmatter block — bail, caller keeps original content
  const lines = m[1].split("\n");
  const keyRe = new RegExp(`^${key}\\s*:`);
  const idx = lines.findIndex(l => keyRe.test(l));
  if (value === undefined) {
    if (idx >= 0) lines.splice(idx, 1);
  } else {
    const line = `${key}: ${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  const newFm = lines.filter(l => l.trim() !== "").join("\n");
  const rest = content.slice(m[0].length);
  return `---\n${newFm}\n---\n${rest}`;
}

/** Replace the body (system prompt) after the frontmatter block. */
function replaceBody(content: string, newBody: string): string {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!m) return content;
  return `${m[0]}${newBody}\n`;
}

/**
 * Revert a single field (identified by its agent-diff.ts NormalizedConfig key)
 * of a replace-mode override back to the bundled default's value.
 *
 * Returns the updated file content, or the original `content` unchanged if
 * the field key is unrecognized or the file has no parsable frontmatter.
 */
export function revertFieldToDefault(content: string, fieldKey: string, def: AgentConfig): string {
  if (fieldKey === "systemPrompt") {
    return replaceBody(content, def.systemPrompt.trim());
  }

  if (fieldKey === "builtinToolNames" || fieldKey === "extSelectors") {
    // Both live in the combined `tools:` field — always revert to the default's
    // full combination so the two never end up half-reverted / inconsistent.
    const value = serializeTools(def.builtinToolNames ?? BUILTIN_TOOL_NAMES, def.extSelectors);
    return setFrontmatterField(content, "tools", value);
  }

  const fmKey = FRONTMATTER_KEYS[fieldKey];
  if (!fmKey) return content;

  if (fieldKey === "extensions" || fieldKey === "skills") {
    const v = fieldKey === "extensions" ? def.extensions : def.skills;
    if (v === undefined || v === true) return setFrontmatterField(content, fmKey, undefined);
    if (v === false) return setFrontmatterField(content, fmKey, "none");
    return setFrontmatterField(content, fmKey, v.join(", "));
  }

  if (fieldKey === "disallowedTools") {
    const v = def.disallowedTools;
    if (v === undefined) return setFrontmatterField(content, fmKey, undefined);
    return setFrontmatterField(content, fmKey, v.length ? v.join(", ") : "none");
  }

  let raw: string | number | boolean | undefined;
  switch (fieldKey) {
    case "description": raw = def.description; break;
    case "displayName": raw = def.displayName; break;
    case "model": raw = def.model; break;
    case "thinking": raw = def.thinking; break;
    case "maxTurns": raw = def.maxTurns; break;
    case "inheritContext": raw = def.inheritContext; break;
    case "runInBackground": raw = def.runInBackground; break;
    case "memory": raw = def.memory; break;
    case "isolation": raw = def.isolation; break;
    case "recoverOnAbort": raw = def.recoverOnAbort; break;
    default: return content;
  }

  if (raw === undefined) return setFrontmatterField(content, fmKey, undefined);
  return setFrontmatterField(content, fmKey, yamlScalar(raw));
}
