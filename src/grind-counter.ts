/**
 * grind-counter.ts — session-local inline-work telemetry with delegation nudges.
 *
 * Counts main-session tool calls, detects long runs of inline work and bash
 * spirals, and produces short non-blocking delegation nudges. All state is
 * in-memory and reset by `Agent` calls or explicit `reset()`. No Pi API
 * coupling.
 */

export interface GrindCounterSettings {
  inlineThreshold: number;
  bashThreshold: number;
  cooldownCalls: number;
  neutralTools: readonly string[];
}

export const DEFAULT_GRIND_COUNTER_SETTINGS: GrindCounterSettings = {
  inlineThreshold: 25,
  bashThreshold: 8,
  cooldownCalls: 25,
  neutralTools: ["get_subagent_result", "steer_subagent"],
};

export type GrindNudgeKind = "inline" | "bash";

export interface GrindNudge {
  kind: GrindNudgeKind;
  message: string;
  inlineStreak: number;
  bashStreak: number;
}

export interface GrindCounterSnapshot {
  inlineStreak: number;
  bashStreak: number;
  inlineThreshold: number;
  bashThreshold: number;
  cooldownCalls: number;
  cooldownRemaining: number;
  pendingNudges: number;
}

const POSITIVE_INT_KEYS: (keyof Pick<GrindCounterSettings, "inlineThreshold" | "bashThreshold" | "cooldownCalls">)[] = [
  "inlineThreshold",
  "bashThreshold",
  "cooldownCalls",
];

/**
 * Counts main-session inline tool calls and produces short, non-blocking
 * delegation nudges at configurable thresholds. All state is in-memory and
 * reset by `Agent` calls or explicit `reset()`. No Pi API coupling.
 */
export class GrindCounter {
  private readonly settings: GrindCounterSettings;
  private readonly neutralTools: Set<string>;
  private inlineStreak = 0;
  private bashStreak = 0;
  private lastNudgeAtInlineStreak: number | undefined = undefined;
  private pendingNudges = new Map<string, GrindNudge>();

  constructor(settings?: Partial<GrindCounterSettings>) {
    const merged = { ...DEFAULT_GRIND_COUNTER_SETTINGS, ...settings };
    for (const key of POSITIVE_INT_KEYS) {
      const value = merged[key];
      if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${key} must be a positive integer`);
      }
    }
    this.settings = merged;
    this.neutralTools = new Set(merged.neutralTools.map((name) => name.trim().toLowerCase()));
  }

  observeToolStart(toolCallId: string, toolName: string): void {
    const normalized = toolName.trim().toLowerCase();

    if (normalized === "agent") {
      this.reset();
      return;
    }

    if (this.neutralTools.has(normalized)) {
      this.bashStreak = 0;
      return;
    }

    if (normalized === "bash") {
      this.inlineStreak += 1;
      this.bashStreak += 1;
    } else {
      this.inlineStreak += 1;
      this.bashStreak = 0;
    }

    const cooldownElapsed =
      this.lastNudgeAtInlineStreak === undefined
        ? Number.POSITIVE_INFINITY
        : this.inlineStreak - this.lastNudgeAtInlineStreak;
    if (cooldownElapsed < this.settings.cooldownCalls) {
      return;
    }

    let nudge: GrindNudge | undefined;
    if (this.bashStreak >= this.settings.bashThreshold) {
      nudge = {
        kind: "bash",
        message: `[Grind counter] ${this.bashStreak} consecutive bash calls. Consider dispatching a worker with the reproduction and latest failure.`,
        inlineStreak: this.inlineStreak,
        bashStreak: this.bashStreak,
      };
    } else if (this.inlineStreak >= this.settings.inlineThreshold) {
      nudge = {
        kind: "inline",
        message: `[Grind counter] ${this.inlineStreak} consecutive inline calls without delegation. Consider dispatching worker/Explore or restarting with a brief.`,
        inlineStreak: this.inlineStreak,
        bashStreak: this.bashStreak,
      };
    }

    if (nudge) {
      this.pendingNudges.set(toolCallId, nudge);
      this.lastNudgeAtInlineStreak = this.inlineStreak;
    }
  }

  consumeNudge(toolCallId: string): GrindNudge | undefined {
    const nudge = this.pendingNudges.get(toolCallId);
    if (!nudge) return undefined;
    this.pendingNudges.delete(toolCallId);
    return nudge;
  }

  reset(): void {
    this.inlineStreak = 0;
    this.bashStreak = 0;
    this.lastNudgeAtInlineStreak = undefined;
    this.pendingNudges.clear();
  }

  snapshot(): GrindCounterSnapshot {
    const cooldownRemaining =
      this.lastNudgeAtInlineStreak === undefined
        ? 0
        : Math.max(0, this.settings.cooldownCalls - (this.inlineStreak - this.lastNudgeAtInlineStreak));
    return {
      inlineStreak: this.inlineStreak,
      bashStreak: this.bashStreak,
      inlineThreshold: this.settings.inlineThreshold,
      bashThreshold: this.settings.bashThreshold,
      cooldownCalls: this.settings.cooldownCalls,
      cooldownRemaining,
      pendingNudges: this.pendingNudges.size,
    };
  }
}

export function formatGrindStatus(snapshot: GrindCounterSnapshot): string {
  const cooldownText =
    snapshot.cooldownRemaining === 0
      ? "nudge cooldown ready"
      : `nudge cooldown ${snapshot.cooldownRemaining} counted calls remaining`;
  return `Grind counter: inline ${snapshot.inlineStreak}/${snapshot.inlineThreshold} | bash ${snapshot.bashStreak}/${snapshot.bashThreshold} | ${cooldownText}`;
}
