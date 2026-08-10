#!/usr/bin/env node

/**
 * preuninstall.mjs
 * Removes the marked pi-subagents guidance block from ~/.pi/agent/AGENTS.md on package uninstall.
 * 
 * Best-effort:
 *   - If file does not exist, exits 0 (no-op).
 *   - If file cannot be read/written, logs a warning and exits 0 (non-fatal).
 *   - Leaves file empty or deletes it if no user content remains (either outcome acceptable).
 *   - Never fails the uninstall.
 * 
 * See scripts/agents-md-block.mjs for core logic.
 */

import { join } from "node:path";
import {
  atomicWriteAgentsMd,
  deleteIfEmpty,
  readAgentsMd,
  removeAllBlocks,
} from "./agents-md-block.mjs";

const home = process.env.HOME;
if (!home) {
  console.error("AGENTS.md preuninstall: HOME environment variable not set; skipping");
  process.exit(0);
}

const agentsMdPath = join(home, ".pi", "agent", "AGENTS.md");

(async () => {
  try {
    // Read file
    const currentContent = await readAgentsMd(agentsMdPath);

    // If file did not exist, no-op
    if (!currentContent) {
      process.exit(0);
    }

    // Remove all marked blocks
    const { result: newContent, hadBlocks } = removeAllBlocks(currentContent);

    // If no blocks found, nothing to do
    if (!hadBlocks) {
      process.exit(0);
    }

    // Write the result back (always, even if empty) to reflect block removal
    if (newContent) {
      await atomicWriteAgentsMd(agentsMdPath, newContent);
      // User content remains; don't delete the file
    } else {
      // No content left after block removal; delete the file
      // Best-effort: attempt to delete; if it fails, leave it
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(agentsMdPath);
      } catch {
        // Ignore errors (file may not exist or permission denied)
      }
    }

    // Success: silently exit 0
    process.exit(0);
  } catch (err) {
    // Best-effort: warn and continue
    console.error(`AGENTS.md preuninstall warning: ${err.message}`);
    process.exit(0);
  }
})();
