/**
 * debug-logger.ts — Optional structured debug logging for pi-subagents.
 *
 * Activated by setting PI_SUBAGENTS_DEBUG=1 (or any truthy value) in the
 * environment. Writes timestamped JSON-lines to:
 *   ~/.pi/logs/pi-subagents-debug.log
 *
 * Designed to be zero-cost when disabled — all calls are no-ops.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(homedir(), ".pi", "logs");
const LOG_FILE = join(LOG_DIR, "pi-subagents-debug.log");

const _debugVal = process.env.PI_SUBAGENTS_DEBUG;
const enabled = _debugVal !== undefined && _debugVal !== "0" && _debugVal !== "false" && _debugVal !== "";

function write(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) {
  if (!enabled) { return; }
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...data,
    });
    appendFileSync(LOG_FILE, `${entry}\n`);
  } catch {
    // Never throw from the logger — swallow silently
  }
}

export const debugLogger = {
  enabled,
  logFile: LOG_FILE,

  info(event: string, data?: Record<string, unknown>) {
    write("info", event, data);
  },

  warn(event: string, data?: Record<string, unknown>) {
    write("warn", event, data);
  },

  error(event: string, err: unknown, data?: Record<string, unknown>) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    write("error", event, { ...data, error: message, stack });
  },
};
