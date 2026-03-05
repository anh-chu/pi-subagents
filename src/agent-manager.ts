/**
 * agent-manager.ts — Tracks agents, background execution, resume support.
 */

import { randomUUID } from "node:crypto";
import type { ExtensionContext, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Model } from "@mariozechner/pi-ai";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { runAgent, resumeAgent, type ToolActivity } from "./agent-runner.js";
import type { SubagentType, AgentRecord, ThinkingLevel } from "./types.js";

export type OnAgentComplete = (record: AgentRecord) => void;

export class AgentManager {
  private agents = new Map<string, AgentRecord>();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private onComplete?: OnAgentComplete;

  constructor(onComplete?: OnAgentComplete) {
    this.onComplete = onComplete;
    // Cleanup completed agents after 10 minutes (but keep sessions for resume)
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Spawn an agent and return its ID immediately (for background use).
   */
  spawn(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    type: SubagentType,
    prompt: string,
    options: {
      description: string;
      model?: Model<any>;
      maxTurns?: number;
      isolated?: boolean;
      inheritContext?: boolean;
      thinkingLevel?: ThinkingLevel;
      systemPromptOverride?: string;
      systemPromptAppend?: string;
      isBackground?: boolean;
      /** Called on tool start/end with activity info (for streaming progress to UI). */
      onToolActivity?: (activity: ToolActivity) => void;
      /** Called when the agent session is created (for accessing session stats). */
      onSessionCreated?: (session: AgentSession) => void;
    },
  ): string {
    const id = randomUUID().slice(0, 17);
    const abortController = new AbortController();
    const record: AgentRecord = {
      id,
      type,
      description: options.description,
      status: "running",
      toolUses: 0,
      startedAt: Date.now(),
      abortController,
    };
    this.agents.set(id, record);

    const promise = runAgent(ctx, type, prompt, {
      pi,
      model: options.model,
      maxTurns: options.maxTurns,
      isolated: options.isolated,
      inheritContext: options.inheritContext,
      thinkingLevel: options.thinkingLevel,
      systemPromptOverride: options.systemPromptOverride,
      systemPromptAppend: options.systemPromptAppend,
      signal: abortController.signal,
      onToolActivity: (activity) => {
        if (activity.type === "end") record.toolUses++;
        options.onToolActivity?.(activity);
      },
      onSessionCreated: (session) => {
        record.session = session;
        options.onSessionCreated?.(session);
      },
    })
      .then(({ responseText, session, aborted, steered }) => {
        // Don't overwrite status if externally stopped via abort()
        if (record.status !== "stopped") {
          record.status = aborted ? "aborted" : steered ? "steered" : "completed";
        }
        record.result = responseText;
        record.session = session;
        record.completedAt ??= Date.now();
        // Notify on background completion
        if (options.isBackground && this.onComplete) {
          this.onComplete(record);
        }
        return responseText;
      })
      .catch((err) => {
        // Don't overwrite status if externally stopped via abort()
        if (record.status !== "stopped") {
          record.status = "error";
        }
        record.error = err instanceof Error ? err.message : String(err);
        record.completedAt ??= Date.now();
        if (options.isBackground && this.onComplete) {
          this.onComplete(record);
        }
        return "";
      });

    record.promise = promise;
    return id;
  }

  /**
   * Spawn an agent and wait for completion (foreground use).
   */
  async spawnAndWait(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    type: SubagentType,
    prompt: string,
    options: {
      description: string;
      model?: Model<any>;
      maxTurns?: number;
      isolated?: boolean;
      inheritContext?: boolean;
      thinkingLevel?: ThinkingLevel;
      systemPromptOverride?: string;
      systemPromptAppend?: string;
      /** Called on tool start/end with activity info (for streaming progress to UI). */
      onToolActivity?: (activity: ToolActivity) => void;
      /** Called when the agent session is created (for accessing session stats). */
      onSessionCreated?: (session: AgentSession) => void;
    },
  ): Promise<AgentRecord> {
    const id = this.spawn(pi, ctx, type, prompt, { ...options, isBackground: false });
    const record = this.agents.get(id)!;
    await record.promise;
    return record;
  }

  /**
   * Resume an existing agent session with a new prompt.
   */
  async resume(
    id: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<AgentRecord | undefined> {
    const record = this.agents.get(id);
    if (!record?.session) return undefined;

    record.status = "running";
    record.startedAt = Date.now();
    record.completedAt = undefined;
    record.result = undefined;
    record.error = undefined;

    try {
      const responseText = await resumeAgent(record.session, prompt, {
        onToolActivity: (activity) => {
          if (activity.type === "end") record.toolUses++;
        },
        signal,
      });
      record.status = "completed";
      record.result = responseText;
      record.completedAt = Date.now();
    } catch (err) {
      record.status = "error";
      record.error = err instanceof Error ? err.message : String(err);
      record.completedAt = Date.now();
    }

    return record;
  }

  getRecord(id: string): AgentRecord | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentRecord[] {
    return [...this.agents.values()].sort(
      (a, b) => b.startedAt - a.startedAt,
    );
  }

  abort(id: string): boolean {
    const record = this.agents.get(id);
    if (!record || record.status !== "running") return false;
    record.abortController?.abort();
    record.status = "stopped";
    record.completedAt = Date.now();
    return true;
  }

  private cleanup() {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [id, record] of this.agents) {
      if (record.status === "running") continue;
      if ((record.completedAt ?? 0) >= cutoff) continue;

      // Dispose and clear session so memory can be reclaimed
      if (record.session) {
        record.session.dispose();
        record.session = undefined;
      }
      this.agents.delete(id);
    }
  }

  dispose() {
    clearInterval(this.cleanupInterval);
    for (const record of this.agents.values()) {
      record.session?.dispose();
    }
    this.agents.clear();
  }
}
