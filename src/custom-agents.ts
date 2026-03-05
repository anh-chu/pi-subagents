/**
 * custom-agents.ts — Load user-defined agents from .pi/agents/*.md files.
 */

import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { SUBAGENT_TYPES, type CustomAgentConfig, type ThinkingLevel } from "./types.js";
import { BUILTIN_TOOL_NAMES } from "./agent-types.js";

/**
 * Scan .pi/agents/*.md and return a map of custom agent configs.
 * Filename (without .md) becomes the agent name.
 */
export function loadCustomAgents(cwd: string): Map<string, CustomAgentConfig> {
  const dir = join(cwd, ".pi", "agents");
  if (!existsSync(dir)) return new Map();

  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith(".md"));
  } catch {
    return new Map();
  }

  const agents = new Map<string, CustomAgentConfig>();

  for (const file of files) {
    const name = basename(file, ".md");
    if ((SUBAGENT_TYPES as readonly string[]).includes(name)) continue;

    let content: string;
    try {
      content = readFileSync(join(dir, file), "utf-8");
    } catch {
      continue;
    }

    const { frontmatter: fm, body } = parseFrontmatter<Record<string, unknown>>(content);

    agents.set(name, {
      name,
      description: str(fm.description) ?? name,
      builtinToolNames: csvList(fm.tools, BUILTIN_TOOL_NAMES),
      extensions: inheritField(fm.extensions ?? fm.inherit_extensions),
      skills: inheritField(fm.skills ?? fm.inherit_skills),
      model: str(fm.model),
      thinking: str(fm.thinking) as ThinkingLevel | undefined,
      maxTurns: positiveInt(fm.max_turns),
      systemPrompt: body.trim(),
      promptMode: fm.prompt_mode === "append" ? "append" : "replace",
      inheritContext: fm.inherit_context === true,
      runInBackground: fm.run_in_background === true,
      isolated: fm.isolated === true,
    });
  }

  return agents;
}

// ---- Field parsers ----
// All follow the same convention: omitted → default, "none"/empty → nothing, value → exact.

/** Extract a string or undefined. */
function str(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

/** Extract a positive integer or undefined. */
function positiveInt(val: unknown): number | undefined {
  return typeof val === "number" && val >= 1 ? val : undefined;
}

/**
 * Parse a comma-separated list field.
 * omitted → defaults; "none"/empty → []; csv → listed items.
 */
function csvList(val: unknown, defaults: string[]): string[] {
  if (val === undefined || val === null) return defaults;
  const s = String(val).trim();
  if (!s || s === "none") return [];
  return s.split(",").map(t => t.trim()).filter(Boolean);
}

/**
 * Parse an inherit field (extensions, skills).
 * omitted/true → true (inherit all); false/"none"/empty → false; csv → listed names.
 */
function inheritField(val: unknown): true | string[] | false {
  if (val === undefined || val === null || val === true) return true;
  if (val === false || val === "none") return false;
  const items = csvList(val, []);
  return items.length > 0 ? items : false;
}
