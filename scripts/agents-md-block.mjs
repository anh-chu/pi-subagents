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
 * Documents four-dial concept, workflow design, routing principle, brief scaffold, skill reference.
 * No orchestrator-role/supervision content (that lives in orchestrator built-in template).
 */
export function generateBlockContent() {
  return `<!-- pi-subagents:begin -->

# Four-Dial Orchestration with pi-subagents

## Four Dials: Brief, Brain, Powers, Knowledge

When dispatching a subagent, tailor four independent dimensions:

1. **Brief**: Self-contained prompt describing the task, context, constraints, and success criteria.
2. **Brain**: Model selection and thinking level settings per dispatch.
3. **Powers**: Agent type preset (general-purpose, Explore, Plan, worker, reviewer, oracle) or omit for bare general-purpose with all tools available.
4. **Knowledge**: Skill references and memory files cited by absolute path within the brief.

## Workflow Design Shapes

Choose the coordination pattern that fits your task:

- **Default to \`run_in_background: true\`.** Dispatch all independent, file-disjoint agents in one message, then collect results.
- **Block on a single agent only when the next dispatch genuinely depends on its result.** Dispatching one agent, waiting, then dispatching an unrelated one is an error.

- **Sequential**: Dependency-ordered background dispatches. Dispatch one agent in the background, collect its result, then decide and dispatch the next step (observation-driven iteration).
  Use when the next step depends on the previous outcome.

- **Parallel fan-out**: Dispatch multiple background agents with independent briefs in one message, then collect all results.
  Use when subtasks are truly independent (e.g., search multiple code patterns in parallel).

- **Dispatch-Review-Iterate**: Dispatch an agent, review their work, send follow-up instructions or dispatch a different agent to refine.
  Use when initial work needs refinement or validation before proceeding.

For each dispatch, choose between:
- **Bare dispatch**: Invoke the agent once and accept the result.
- **Built-in templates**: Use a preset agent type (Explore for read-only search, worker for trusted implementation).
- **Custom agents**: Define agent types in .pi/agents/*.md for domain-specific presets.

## Delegation Criterion: Context Economics

Decide inline-vs-delegate by what your context needs, not by task size:

- Delegate work whose intermediate output (searches, reads, edits, test runs) you will not reason over again — you only need its conclusion.
- Keep work inline when you must think with the raw output.
- Multi-file or long work usually delegates because it generates disposable debris, not because it is "big". A directed lookup with a known target stays inline even if it touches several files.

**Never delegate understanding.** Understand a result before dispatching the next concrete step. Avoid "based on your findings, fix it" handoffs; state the diagnosis and the specific change instead.

**Do not double-work.** Once you delegate a workstream, stop running the same searches or edits yourself. Spend coordinator context on synthesis and the next decision.

## Cheap Dispatch Boundaries

Do NOT dispatch a subagent for:
- A single-file read that answers a simple factual question.
- Validation commands you can run directly (\`git status\`, \`git diff --stat\`, test suites, builds).
- Reading output you could produce yourself with one tool call.

When deciding, ask: "Could one direct tool call answer this faster than a full subagent round-trip?" If yes, act inline.

## Routing Principle: Workload-Based Tier Language

Select agents by workload tier, not vendor or model name:

- **Cheap**: Extraction, summarization, grunt work (e.g., find files matching a pattern, list directory structure).
  Use least powerful available agent.

- **Mid-tier**: Bounded implementation tasks (e.g., add a small feature, refactor a function, write tests).
  Use a capable, balanced agent.

- **Strongest available**: Ambiguous design decisions, high-stakes code review, complex architectural changes.
  Use your most powerful available model/agent.

*Note: Concrete model defaults and available models are listed in the Agent tool description (see Agent tool documentation).
Tier routing uses workload language only; no vendor family names in this guidance.*

## Brief Scaffold: Goal, Context, Scope, Acceptance, Return

Structure your dispatch briefs with these five elements:

1. **Goal**: One-sentence description of what you want the agent to accomplish.
2. **Context**: Background information, prior findings, constraints, or dependencies the agent needs to know.
3. **Scope**: Explicit boundaries (what to do and what not to do; e.g., "read-only", "do not modify config files").
4. **Acceptance**: How you will evaluate success (what does "done" look like?).
5. **Return**: Expected output format (structured data, code, summary, file edits, etc.).

Example:
\`\`\`
Goal: Identify all places where user authentication is checked in the codebase.
Context: We are refactoring auth to support multi-factor authentication and need a map of all auth touchpoints.
Scope: Search src/ and tests/ only. Ignore vendor and build artifacts. List functions, not individual lines.
Acceptance: Complete list of auth functions/modules and their file locations.
Return: Markdown table with columns: file, function name, line number, auth type (session/token/mfa).
\`\`\`

## Skill Reference Pattern: Cite .md Files by Path

When you need the agent to apply domain-specific knowledge, cite .md files by absolute path in the brief rather than using a skills parameter.

Example:
\`\`\`
Context: Refer to /home/user/projects/myapp/CODING_STANDARDS.md for code style, and /home/user/projects/myapp/SECURITY_POLICY.md for security checks.
\`\`\`

This keeps the brief self-contained and allows the agent to fetch knowledge as needed.

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
