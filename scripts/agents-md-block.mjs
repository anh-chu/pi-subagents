/**
 * agents-md-block.mjs
 * Shared utilities for managing pi-subagents guidance blocks in ~/.pi/agent/AGENTS.md
 * Exported functions are pure and testable; see postinstall.mjs and preuninstall.mjs for entry points.
 */

import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Canonical unversioned markers for pi-subagents guidance block.
 */
export const BEGIN_MARKER = "<!-- pi-subagents:begin -->";
export const END_MARKER = "<!-- pi-subagents:end -->";

/**
 * Regex pattern to match any pi-subagents block (canonical or legacy version-tagged).
 * Matches: <!-- pi-subagents:begin[^>]*--> ... <!-- pi-subagents:end[^>]*-->
 * This tolerates version tags in legacy markers and consolidates them.
 * NOTE: This is exported for testing; in functions, create new regex instances to avoid
 * global regex state issues with the /g flag.
 */
export const BLOCK_PATTERN = /<!-- pi-subagents:begin[^>]*-->([\s\S]*?)<!-- pi-subagents:end[^>]*-->/g;

/**
 * Helper to create a fresh regex for block matching (avoids /g flag state issues).
 */
function createBlockRegex() {
  return /<!-- pi-subagents:begin[^>]*-->[\s\S]*?<!-- pi-subagents:end[^>]*-->/g;
}

/**
 * The guidance block content for AGENTS.md.
 * Documents standalone four-dial, delegation, routing, and briefing guidance.
 * No orchestrator-role/supervision content (that lives in orchestrator built-in template).
 */
export function generateBlockContent() {
  return `<!-- pi-subagents:begin -->

# Four-Dial Orchestration with pi-subagents

Tailor each dispatch across four independent dials:

1. **Brief**: Self-contained task, context, boundaries, and success criteria.
2. **Brain**: Model and thinking level suited to task complexity.
3. **Powers**: Built-in preset or custom agent from \`.pi/agents/*.md\`.
4. **Knowledge**: Relevant skill or memory Markdown files, cited by absolute path in the brief.

## Delegate deliberately

- Delegate bounded work when you need its conclusion, not its intermediate output. Keep work inline when you must reason with raw evidence.
- Parent owns synthesis and decisions. Do not delegate understanding or repeat delegated searches or edits.
- Give every child a self-contained brief. It starts without your session context unless you explicitly provide it.
- For parallel edits, declare non-overlapping \`files: [...]\`. \`isolation: "worktree"\` changes working directory, not sandboxing.

## Choose a workflow

- **Parallel fan-out**: Default to \`run_in_background: true\`. Dispatch independent, file-disjoint work in one message, then collect results.
- **Sequential**: Wait only when next dispatch depends on prior result.
- **Dispatch-review-iterate**: Review result before asking for refinement or follow-up work.

## Route by workload

- **Explore**: Read-only codebase recon.
- **Plan**: Ambiguous, cross-cutting, or high-risk implementation planning.
- **worker**: Bounded implementation and tests.
- **reviewer**: Independent review after non-trivial changes.
- **oracle**: Strong second opinion for risky decisions.
- **general-purpose**: Child needing parent's full tools and reasoning context.

Select model and thinking level by workload, not vendor name. Use the least costly capability that meets task needs. Available models and preset defaults are in the \`Agent\` tool description.

## Brief format

Include all five:

1. **Goal**: Verifiable outcome.
2. **Context**: Known facts, constraints, dependencies, and ruled-out approaches.
3. **Scope**: Boundaries, including paths and whether edits are allowed.
4. **Acceptance**: Observable conditions for success.
5. **Return**: Required result format and length.

Cite domain guidance directly in the brief, for example: \`Refer to /absolute/path/CODING_STANDARDS.md for code style.\`

<!-- pi-subagents:end -->`;
}

/**
 * Extract user content (everything outside marked blocks) from file content.
 * Removes all pi-subagents blocks (canonical and any legacy version-tagged).
 * Returns the remaining user content byte-exact (no trimming) and a boolean indicating if any blocks were found.
 */
export function extractUserContent(content) {
  const pattern = createBlockRegex();
  const hadBlocks = pattern.test(content);
  // Remove blocks only; preserve all other bytes verbatim (no normalization)
  const userContent = content.replace(createBlockRegex(), "");
  return { userContent, hadBlocks };
}

/**
 * Reconstruct AGENTS.md with fresh block appended.
 * Preserves user content byte-exact; removes all old blocks (canonical and legacy versions).
 * Ensures exactly one blank line (two newlines) between user content and block.
 */
export function reconstructAgentsMd(content) {
  const { userContent } = extractUserContent(content);
  const block = generateBlockContent();
  
  if (!userContent) {
    return block;
  }
  
  // Preserve user content; ensure exactly one blank line before block
  // Remove excess trailing newlines, then add exactly two for one blank line
  let normalized = userContent.replace(/\n+$/, "");
  normalized += "\n\n";
  
  return normalized + block;
}

/**
 * Prepare directory for AGENTS.md write.
 * Creates ~/.pi/agent/ recursively if missing.
 * Returns the resolved agentsMdPath.
 */
export async function prepareDirectory(agentsMdPath) {
  const dir = dirname(agentsMdPath);
  try {
    await fs.mkdir(dir, { recursive: true });
    return agentsMdPath;
  } catch (err) {
    throw new Error(`Failed to create directory ${dir}: ${err.message}`);
  }
}

/**
 * Atomically write content to AGENTS.md.
 * Uses temp file + rename pattern for atomic writes.
 * Returns true on success, false on error (caller should log warning).
 */
export async function atomicWriteAgentsMd(agentsMdPath, content) {
  const dir = dirname(agentsMdPath);
  const tempPath = `${agentsMdPath}.tmp.${Date.now()}`;

  try {
    // Write to temp file
    await fs.writeFile(tempPath, content, "utf8");
    // Atomic rename
    await fs.rename(tempPath, agentsMdPath);
    return true;
  } catch (err) {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        await fs.unlink(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Read AGENTS.md, returning content or empty string if file does not exist.
 */
export async function readAgentsMd(agentsMdPath) {
  try {
    return await fs.readFile(agentsMdPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

/**
 * Remove all marked blocks from content, including the separator blank line.
 * Returns the remaining content byte-exact and a boolean indicating if any blocks were found.
 * Removes the block and the preceding blank line separator (added by reconstructAgentsMd).
 */
export function removeAllBlocks(content) {
  const pattern = createBlockRegex();
  const hadBlocks = pattern.test(content);
  
  if (!hadBlocks) {
    return { result: content, hadBlocks: false };
  }
  
  // Remove block with preceding separator (two newlines added by reconstructAgentsMd)
  let result = content.replace(/\n\n<!-- pi-subagents:begin[^>]*-->[\s\S]*?<!-- pi-subagents:end[^>]*-->/g, "");
  
  // Fallback: if the separator pattern didn't match (e.g., block at start or legacy format),
  // remove the block without separator requirement
  if (result === content) {
    result = content.replace(/<!-- pi-subagents:begin[^>]*-->[\s\S]*?<!-- pi-subagents:end[^>]*-->/g, "");
  }
  
  return { result, hadBlocks };
}

/**
 * Delete AGENTS.md if it exists and is empty or only whitespace.
 * Best-effort; does not fail if file is in use or cannot be deleted.
 */
export async function deleteIfEmpty(agentsMdPath) {
  try {
    const content = await readAgentsMd(agentsMdPath);
    if (!content || content.trim() === "") {
      await fs.unlink(agentsMdPath);
    }
  } catch {
    // Ignore errors (file doesn't exist or cannot be deleted; that's OK)
  }
}
