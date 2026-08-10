#!/usr/bin/env node

/**
 * postinstall.mjs
 * Writes a marked guidance block to ~/.pi/agent/AGENTS.md on package install.
 * 
 * Guards:
 *   - Exits 0 (no write) if process.env.CI is set (CI environment).
 *   - Exits 0 (no write) if INIT_CWD resolves to the package's own directory (dev install).
 * 
 * Best-effort:
 *   - Any fs error logs a warning to stderr and exits 0 (install continues).
 *   - Non-fatal; install succeeds even if AGENTS.md cannot be written.
 * 
 * See scripts/agents-md-block.mjs for core logic.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicWriteAgentsMd,
  prepareDirectory,
  readAgentsMd,
  reconstructAgentsMd,
} from "./agents-md-block.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageDir = resolve(__dirname, "..");

// Guard: skip if CI environment
if (process.env.CI) {
  process.exit(0);
}

// Guard: skip if dev install (INIT_CWD resolves to package's own directory)
const initCwd = process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : null;
if (initCwd && initCwd === packageDir) {
  process.exit(0);
}

// Resolve ~/.pi/agent/AGENTS.md
const home = process.env.HOME;
if (!home) {
  console.error("AGENTS.md postinstall: HOME environment variable not set; skipping");
  process.exit(0);
}

const agentsMdPath = join(home, ".pi", "agent", "AGENTS.md");

(async () => {
  try {
    // Prepare directory
    await prepareDirectory(agentsMdPath);

    // Read existing file or empty string
    const currentContent = await readAgentsMd(agentsMdPath);

    // Reconstruct with fresh block
    const newContent = reconstructAgentsMd(currentContent);

    // Skip write if content is unchanged (idempotent, no unnecessary disk writes)
    if (currentContent === newContent) {
      process.exit(0);
    }

    // Atomically write
    await atomicWriteAgentsMd(agentsMdPath, newContent);

    // Success: silently exit 0
    process.exit(0);
  } catch (err) {
    // Best-effort: warn and continue
    console.error(`AGENTS.md postinstall warning: ${err.message}`);
    process.exit(0);
  }
})();
