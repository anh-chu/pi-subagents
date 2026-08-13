/**
 * context.ts — Parent conversation context for subagent inheritance.
 *
 * Two fidelity levels:
 *  - transcript: a lossy plain-text projection (drops tool results). Good when
 *    you want a clean summary without noisy tool output. See buildParentContext.
 *  - fork: a structured replay of the parent's message entries (preserves tool
 *    results, tool calls, and thinking blocks) into the child's SessionManager,
 *    so the child sees the real conversation the LLM saw. See seedForkedSessionManager.
 */

import { buildSessionContext, SessionManager, type ExtensionContext } from "@mariozechner/pi-coding-agent";

/** Extract text from a message content block array. */
export function extractText(content: unknown[]): string {
  return content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text ?? "")
    .join("\n");
}

/**
 * Build a text representation of the parent conversation context.
 * Used when inherit_context is true to give the subagent visibility
 * into what has been discussed/done so far.
 */
export function buildParentContext(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getBranch();
  if (!entries || entries.length === 0) return "";

  const parts: string[] = [];

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg.role === "user") {
        const text = typeof msg.content === "string"
          ? msg.content
          : extractText(msg.content);
        if (text.trim()) parts.push(`[User]: ${text.trim()}`);
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content);
        if (text.trim()) parts.push(`[Assistant]: ${text.trim()}`);
      }
      // Skip toolResult messages — too verbose for context
    } else if (entry.type === "compaction") {
      // Include compaction summaries — they're already condensed
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
    }
  }

  if (parts.length === 0) return "";

  return `# Parent Conversation Context
The following is the conversation history from the parent session that spawned you.
Use this context to understand what has been discussed and decided so far.

${parts.join("\n\n")}

---
# Your Task (below)
`;
}

/**
 * Build an in-memory SessionManager seeded with a structured replay of the
 * parent's conversation, for context: "fork". Unlike buildParentContext (a lossy
 * text projection), this preserves the real message structure — user/assistant
 * turns, tool calls, and tool results — so the forked child sees what the parent
 * LLM actually saw.
 *
 * The child still gets its own specialist system prompt and its own task prompt
 * (appended after this seeded history by session.prompt). This is a structured
 * context fork, not a cache-identical inference fork: the system prompt and tool
 * set differ from the parent by design.
 *
 * Returns undefined when there is no parent history to seed (caller falls back
 * to a fresh in-memory session).
 */
export function seedForkedSessionManager(
  ctx: ExtensionContext,
  cwd: string,
): SessionManager | undefined {
  // Use the compaction-aware LLM view, not raw getBranch() entries:
  // buildSessionContext() resolves compaction so a forked child of a compacted
  // parent replays the summary + kept tail (what the parent LLM actually sees),
  // never the raw pre-compaction messages. ctx.sessionManager is read-only and
  // does not expose the method form, so call the standalone function with the
  // manager's entries and current leaf.
  const messages = buildSessionContext(
    ctx.sessionManager.getEntries(),
    ctx.sessionManager.getLeafId(),
  ).messages;
  if (!messages || messages.length === 0) return undefined;

  const sm = SessionManager.inMemory(cwd);
  let seeded = 0;
  for (const raw of messages) {
    // buildSessionContext resolves a compacted parent into a summary message
    // (role "compactionSummary" / "branchSummary"). appendMessage only accepts
    // plain user/assistant/toolResult roles, so normalize any summary-role
    // message into a plain user message carrying the summary text — otherwise
    // the compacted history would be silently lost.
    const msg = normalizeForReplay(raw as unknown as Record<string, unknown>);
    if (!msg) continue;
    try {
      // appendMessage replays the structured AgentMessage (user/assistant/toolResult)
      // as a child of the current leaf, preserving order and tool linkage.
      sm.appendMessage(msg as Parameters<SessionManager["appendMessage"]>[0]);
      seeded++;
    } catch {
      // Defensive: skip an entry appendMessage still rejects rather than
      // aborting the whole fork.
    }
  }

  return seeded > 0 ? sm : undefined;
}

/**
 * Normalize a resolved context message into a shape appendMessage accepts.
 * Standard roles (user/assistant/toolResult) pass through. Summary-role
 * messages (compactionSummary/branchSummary) are converted to a plain user
 * message that preserves the summary text so compacted context is not lost.
 * Returns undefined for shapes with nothing usable to replay.
 */
export function normalizeForReplay(msg: Record<string, unknown>): unknown | undefined {
  const role = msg.role;
  if (role === "user" || role === "assistant" || role === "toolResult") return msg;
  if (role === "compactionSummary" || role === "branchSummary") {
    const summary = typeof msg.summary === "string" ? msg.summary : "";
    if (!summary) return undefined;
    return {
      role: "user",
      content: `# Summary of earlier conversation (compacted)\n${summary}`,
    };
  }
  return undefined;
}
