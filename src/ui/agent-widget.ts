/**
 * agent-widget.ts - Persistent widget showing running/completed agents above the editor.
 *
 * Displays a tree of agents with animated spinners, live stats, and activity descriptions.
 * Uses the callback form of setWidget for themed rendering.
 */

import { truncateToWidth } from "@mariozechner/pi-tui";
import type { AgentManager } from "../agent-manager.js";
import { getConfig } from "../agent-types.js";
import type { SubagentType } from "../types.js";
import { CARD_THEMES, formatElapsed, renderCard } from "../ui/tui-draw.js";

// ---- Constants ----

/** Maximum number of rendered lines before overflow collapse kicks in. */
const MAX_WIDGET_LINES = 12;

/** Braille spinner frames for animated running indicator. */
export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Statuses that indicate an error/non-success outcome (used for linger behavior and icon rendering). */
export const ERROR_STATUSES = new Set([
  "error",
  "aborted",
  "steered",
  "stopped",
]);

/** Tool name → human-readable action for activity descriptions. */
const TOOL_DISPLAY: Record<string, string> = {
  read: "reading",
  bash: "running command",
  edit: "editing",
  write: "writing",
  grep: "searching",
  find: "finding files",
  ls: "listing",
};

// ---- Types ----

export interface Theme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

export interface UICtx {
  setStatus(key: string, text: string | undefined): void;
  setWidget(
    key: string,
    content:
      | undefined
      | ((
          tui: any,
          theme: Theme
        ) => { render(): string[]; invalidate(): void }),
    options?: { placement?: "aboveEditor" | "belowEditor" }
  ): void;
}

/** Per-agent live activity state. */
export interface AgentActivity {
  activeTools: Map<string, string>;
  toolUses: number;
  turns: number;
  turnCount?: number;
  maxTurns?: number;
  tokens: string;
  responseText: string;
  session?: { getSessionStats(): { tokens: { total: number } } };
}

/** Metadata attached to Agent tool results for custom rendering. */
export interface AgentDetails {
  displayName: string;
  description: string;
  subagentType: string;
  toolUses: number;
  tokens: string;
  durationMs: number;
  status:
    | "queued"
    | "running"
    | "completed"
    | "steered"
    | "aborted"
    | "stopped"
    | "error"
    | "background";
  /** Human-readable description of what the agent is currently doing. */
  activity?: string;
  /** Current spinner frame index (for animated running indicator). */
  spinnerFrame?: number;
  /** Short model name if different from parent (e.g. "haiku", "sonnet"). */
  modelName?: string;
  thinkingLevel?: string;
  /** Notable config tags (e.g. ["thinking: high", "isolated"]). */
  tags?: string[];
  agentId?: string;
  error?: string;
  /** Current turn count (for running agents). */
  turns?: number;
  turnCount?: number;
  /** Max turns limit (for running agents). */
  maxTurns?: number;
}

// ---- Formatting helpers ----

/** Format a token count compactly: "33.8k token", "1.2M token". */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M token`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k token`;
  }
  return `${count} token`;
}

/** Format milliseconds as human-readable duration. */
export function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format turns compactly for renderer. */
export function formatTurns(turnCount: number, maxTurns?: number): string {
  return maxTurns ? `⟳${turnCount}≤${maxTurns}` : `⟳${turnCount}`;
}

/** Format duration from start/completed timestamps. */
export function formatDuration(
  startedAt: number,
  completedAt?: number
): string {
  if (completedAt) {
    return formatMs(completedAt - startedAt);
  }
  return `${formatMs(Date.now() - startedAt)} (running)`;
}

/** Get display name for any agent type (built-in or custom). */
export function getDisplayName(type: SubagentType): string {
  return getConfig(type).displayName;
}



/** Short label for non-default prompt mode (e.g. "append"). Returns undefined for the default "replace" mode. */
export function getPromptModeLabel(type: SubagentType): string | undefined {
  const config = getConfig(type);
  return config.promptMode === "append" ? "append" : undefined;
}

/** Compact model/thinking tag used in status line and tests. */
export function formatAgentConfigTag(
  modelName?: string,
  thinkingLevel?: string
): string | undefined {
  if (modelName && thinkingLevel) {
    return `${modelName}:${thinkingLevel}`;
  }
  if (modelName) {
    return modelName;
  }
  if (thinkingLevel) {
    return `thinking:${thinkingLevel}`;
  }
  return undefined;
}

/** Truncate text to a single line, max `len` chars. */
function truncateLine(text: string, len = 60): string {
  const line =
    text
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  if (line.length <= len) {
    return line;
  }
  return line.slice(0, len) + "...";
}

/** Build a human-readable activity string from currently-running tools or response text. */
export function describeActivity(
  activeTools: Map<string, string>,
  responseText?: string
): string {
  if (activeTools.size > 0) {
    const groups = new Map<string, number>();
    for (const toolName of activeTools.values()) {
      const action = TOOL_DISPLAY[toolName] ?? toolName;
      groups.set(action, (groups.get(action) ?? 0) + 1);
    }

    const parts: string[] = [];
    for (const [action, count] of groups) {
      if (count > 1) {
        parts.push(
          `${action} ${count} ${action === "searching" ? "patterns" : "files"}`
        );
      } else {
        parts.push(action);
      }
    }
    return parts.join(", ") + "...";
  }

  // No tools active - show truncated response text if available
  if (responseText && responseText.trim().length > 0) {
    return truncateLine(responseText);
  }

  return "thinking...";
}

// ---- Widget manager ----

export type WidgetDisplayMode = "cards" | "tree";

export class AgentWidget {
  private uiCtx: UICtx | undefined;
  private widgetFrame = 0;
  private widgetInterval: ReturnType<typeof setInterval> | undefined;
  private displayMode: WidgetDisplayMode = "cards";
  /** Tracks how many turns each finished agent has survived. Key: agent ID, Value: turns since finished. */
  private finishedTurnAge = new Map<string, number>();
  /** How many extra turns errors/aborted agents linger (completed agents clear after 1 turn). */
  private static readonly ERROR_LINGER_TURNS = 2;

  constructor(
    private manager: AgentManager,
    private agentActivity: Map<string, AgentActivity>
  ) {}

  /** Set the UI context (grabbed from first tool execution). */
  setUICtx(ctx: UICtx) {
    this.uiCtx = ctx;
  }

  /** Toggle or set the running-agent display mode and force a widget refresh. */
  setDisplayMode(mode: WidgetDisplayMode): void {
    this.displayMode = mode;
    this.update();
  }

  getDisplayMode(): WidgetDisplayMode {
    return this.displayMode;
  }

  /**
   * Called on each new turn (tool_execution_start).
   * Ages finished agents and clears those that have lingered long enough.
   */
  onTurnStart() {
    // Age all finished agents
    for (const [id, age] of this.finishedTurnAge) {
      this.finishedTurnAge.set(id, age + 1);
    }
    // Trigger a widget refresh (will filter out expired agents)
    this.update();
  }

  /** Ensure the widget update timer is running. */
  ensureTimer() {
    if (!this.widgetInterval) {
      this.widgetInterval = setInterval(() => this.update(), 80);
    }
  }

  /** Check if a finished agent should still be shown in the widget. */
  private shouldShowFinished(agentId: string, status: string): boolean {
    const age = this.finishedTurnAge.get(agentId) ?? 0;
    const maxAge = ERROR_STATUSES.has(status)
      ? AgentWidget.ERROR_LINGER_TURNS
      : 1;
    return age < maxAge;
  }

  /** Record an agent as finished (call when agent completes). */
  markFinished(agentId: string) {
    if (!this.finishedTurnAge.has(agentId)) {
      this.finishedTurnAge.set(agentId, 0);
    }
  }

  /** Render running agents as a card grid. */
  private renderAgentCards(
    running: Array<{
      id: string;
      type: SubagentType;
      status: string;
      description: string;
      toolUses: number;
      startedAt: number;
      modelName?: string;
      thinkingLevel?: string;
    }>,
    agentActivity: Map<string, AgentActivity>,
    theme: Theme,
    width: number
  ): string[] {
    if (running.length === 0) {
      return [];
    }

    const cols = Math.max(1, Math.min(3, running.length));
    const gap = 1;
    const colWidth = Math.max(2, Math.floor((width - gap * (cols - 1)) / cols));
    const phase = Math.floor((Date.now() / 2000) % 3);
    const linesByCard: string[][] = [];

    for (let i = 0; i < running.length; i++) {
      const a = running[i];
      const bg = agentActivity.get(a.id);
      const activity = bg ? describeActivity(bg.activeTools, bg.responseText) : "thinking...";
      const status = `⚡ working${".".repeat(phase + 1)}`;
      const elapsed = formatElapsed(a.startedAt);
      const name = getDisplayName(a.type);
      const shortType = formatAgentConfigTag(a.modelName, a.thinkingLevel) ?? name;
      const card = renderCard({
        title: a.description,
        badge: `#${i + 1}`,
        content: activity,
        footer: `${status} ${elapsed}`,
        footerRight: shortType,
        colWidth,
        theme,
        cardTheme: CARD_THEMES[i % CARD_THEMES.length],
      });
      linesByCard.push(card);
    }

    const rows: string[] = [];
    for (let i = 0; i < linesByCard.length; i += cols) {
      const chunk = linesByCard.slice(i, i + cols);
      const rowHeight = Math.max(...chunk.map((card) => card.length));
      for (let lineIdx = 0; lineIdx < rowHeight; lineIdx++) {
        const parts = chunk.map((card) => card[lineIdx] ?? " ".repeat(colWidth));
        rows.push(parts.join(" ".repeat(gap)));
      }
    }
    return rows;
  }

  /** Render running agents as two-line tree rows [header, activity] each. */
  private renderTreeRunningLines(
    running: Array<{
      id: string;
      type: SubagentType;
      description: string;
      toolUses: number;
      startedAt: number;
      modelName?: string;
      thinkingLevel?: string;
    }>,
    agentActivity: Map<string, AgentActivity>,
    theme: Theme,
    frame: string,
    truncate: (s: string) => string
  ): string[][] {
    const lines: string[][] = [];
    for (const a of running) {
      const name = getDisplayName(a.type);
      const modeLabel = getPromptModeLabel(a.type);
      const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
      const elapsed = formatMs(Date.now() - a.startedAt);
      const bg = agentActivity.get(a.id);
      const toolUses = bg?.toolUses ?? a.toolUses;
      let tokenText = "";
      if (bg?.session) {
        try {
          tokenText = formatTokens(bg.session.getSessionStats().tokens.total);
        } catch { /* best-effort */ }
      }
      const parts: string[] = [];
      const turnCount = bg?.turnCount;
      if (turnCount && turnCount > 0) {
        parts.push(`turn ${turnCount}/${bg?.maxTurns}`);
      }
      if (toolUses > 0) {
        parts.push(`${toolUses} tool use${toolUses === 1 ? "" : "s"}`);
      }
      if (tokenText) { parts.push(tokenText); }
      parts.push(elapsed);
      const statsText = parts.join(" · ");
      const activity = bg ? describeActivity(bg.activeTools, bg.responseText) : "thinking...";
      const configTag = formatAgentConfigTag(a.modelName, a.thinkingLevel);
      const configSuffix = configTag ? ` ${theme.fg("dim", `(${configTag})`)}` : "";
      lines.push([
        truncate(
          `${theme.fg("dim", "├─")} ${theme.fg("accent", frame)} ${theme.bold(name)}${modeTag}${configSuffix}  ${theme.fg("muted", a.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", statsText)}`
        ),
        truncate(
          `${theme.fg("dim", "│  ")}  ⎿  ${theme.fg("dim", activity)}`
        ),
      ]);
    }
    return lines;
  }

  /** Render a finished agent line. */
  private renderFinishedLine(
    a: {
      type: SubagentType;
      status: string;
      description: string;
      toolUses: number;
      startedAt: number;
      completedAt?: number;
      error?: string;
    },
    theme: Theme
  ): string {
    const name = getDisplayName(a.type);
    const modeLabel = getPromptModeLabel(a.type);
    const modeTag = modeLabel ? ` (${modeLabel})` : "";
    const duration = formatMs((a.completedAt ?? Date.now()) - a.startedAt);

    let icon: string;
    let statusText: string;
    if (a.status === "completed") {
      icon = theme.fg("success", "✓");
      statusText = "";
    } else if (a.status === "steered") {
      icon = theme.fg("warning", "✓");
      statusText = theme.fg("warning", " (turn limit)");
    } else if (a.status === "stopped") {
      icon = theme.fg("dim", "■");
      statusText = theme.fg("dim", " stopped");
    } else if (a.status === "error") {
      icon = theme.fg("error", "✗");
      const errMsg = a.error ? `: ${a.error.slice(0, 60)}` : "";
      statusText = theme.fg("error", ` error${errMsg}`);
    } else {
      // aborted
      icon = theme.fg("error", "✗");
      statusText = theme.fg("warning", " aborted");
    }

    const parts: string[] = [];
    if (a.toolUses > 0) {
      parts.push(`${a.toolUses} tool use${a.toolUses === 1 ? "" : "s"}`);
    }
    parts.push(duration);

    return `${icon} ${theme.fg("dim", name)}${theme.fg("dim", modeTag)}  ${theme.fg("dim", a.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", parts.join(" · "))}${statusText}`;
  }

  /** Force an immediate widget update. */
  update() {
    if (!this.uiCtx) {
      return;
    }
    const allAgents = this.manager.listAgents();
    const running = allAgents.filter((a) => a.status === "running");
    const queued = allAgents.filter((a) => a.status === "queued");
    const finished = allAgents.filter(
      (a) =>
        a.status !== "running" &&
        a.status !== "queued" &&
        a.completedAt &&
        this.shouldShowFinished(a.id, a.status)
    );

    const hasActive = running.length > 0 || queued.length > 0;
    const hasFinished = finished.length > 0;

    // Nothing to show - clear widget
    if (!(hasActive || hasFinished)) {
      this.uiCtx.setWidget("agents", undefined);
      this.uiCtx.setStatus("subagents", undefined);
      if (this.widgetInterval) {
        clearInterval(this.widgetInterval);
        this.widgetInterval = undefined;
      }
      // Clean up stale entries
      for (const [id] of this.finishedTurnAge) {
        if (!allAgents.some((a) => a.id === id)) {
          this.finishedTurnAge.delete(id);
        }
      }
      return;
    }

    // Ensure the update interval is running whenever we have agents to display
    this.ensureTimer();

    // Status bar
    if (hasActive) {
      const statusParts: string[] = [];
      if (running.length > 0) {
        statusParts.push(`${running.length} running`);
      }
      if (queued.length > 0) {
        statusParts.push(`${queued.length} queued`);
      }
      const total = running.length + queued.length;
      const base = `${statusParts.join(", ")} agent${total === 1 ? "" : "s"}`;
      const runningTag =
        running.length === 1
          ? formatAgentConfigTag(
              running[0]?.modelName,
              running[0]?.thinkingLevel
            )
          : undefined;
      this.uiCtx.setStatus(
        "subagents",
        runningTag ? `${base} · ${runningTag}` : base
      );
    } else {
      this.uiCtx.setStatus("subagents", undefined);
    }

    this.widgetFrame++;
    const frame = SPINNER[this.widgetFrame % SPINNER.length];

    this.uiCtx.setWidget(
      "agents",
      (tui, theme) => {
        const w = tui.terminal.columns;
        const truncate = (line: string) => truncateToWidth(line, w);
        const headingColor = hasActive ? "accent" : "dim";
        const headingIcon = hasActive ? "●" : "○";

        const finishedLines: string[] = [];
        for (const a of finished) {
          finishedLines.push(
            truncate(
              theme.fg("dim", "├─") + " " + this.renderFinishedLine(a, theme)
            )
          );
        }

        const queuedLine =
          queued.length > 0
            ? truncate(
                theme.fg("dim", "├─") +
                  ` ${theme.fg("muted", "◦")} ${theme.fg("dim", `${queued.length} queued`)}`
              )
            : undefined;

        const lines: string[] = [
          truncate(
            `${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, "Agents")}`
          ),
        ];

        const maxBody = MAX_WIDGET_LINES - 1;

        if (this.displayMode === "cards") {
          // Cards mode: running agents as colored card grid, finished as tree rows below
          const runningCards = this.renderAgentCards(running, this.agentActivity, theme, w);
          const bodyLines = running.length > 0
            ? [...runningCards, ...finishedLines]
            : [...finishedLines, ...(queuedLine ? [queuedLine] : [])];

          if (bodyLines.length <= maxBody) {
            lines.push(...bodyLines);
            if (lines.length > 1) {
              lines[lines.length - 1] = lines[lines.length - 1].replace("├─", "└─");
            }
          } else {
            let budget = maxBody - 1;
            let hiddenCount = 0;
            for (const line of bodyLines) {
              if (budget >= 1) { lines.push(line); budget--; }
              else { hiddenCount++; }
            }
            lines.push(truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", `+${hiddenCount} more`)}` ));
          }
        } else {
          // Tree mode: running agents as two-line spinner rows
          const runningLines = this.renderTreeRunningLines(
            running, this.agentActivity, theme, frame, truncate
          );
          const flatRunning = runningLines.flat();
          const bodyLines = running.length > 0
            ? [...flatRunning, ...finishedLines]
            : [...finishedLines, ...(queuedLine ? [queuedLine] : [])];

          if (bodyLines.length <= maxBody) {
            lines.push(...bodyLines);
            if (lines.length > 1) {
              lines[lines.length - 1] = lines[lines.length - 1].replace("├─", "└─");
              // Fix activity indent when last item is a running agent
              if (running.length > 0 && !queuedLine && finishedLines.length === 0 && lines.length >= 3) {
                lines[lines.length - 2] = lines[lines.length - 2].replace("├─", "└─");
                lines[lines.length - 1] = lines[lines.length - 1].replace("│  ", "   ");
              }
            }
          } else {
            let budget = maxBody - 1;
            let hiddenRunning = 0;
            let hiddenFinished = 0;
            let hiddenQueued = 0;
            for (const pair of runningLines) {
              if (budget >= 2) { lines.push(...pair); budget -= 2; }
              else { hiddenRunning++; }
            }
            if (!running.length && queuedLine && budget >= 1) { lines.push(queuedLine); budget--; }
            else if (!running.length && queuedLine) { hiddenQueued++; }
            for (const fl of finishedLines) {
              if (budget >= 1) { lines.push(fl); budget--; }
              else { hiddenFinished++; }
            }
            const overflowParts: string[] = [];
            if (hiddenRunning > 0) { overflowParts.push(`${hiddenRunning} running`); }
            if (hiddenQueued > 0) { overflowParts.push(`${hiddenQueued} queued`); }
            if (hiddenFinished > 0) { overflowParts.push(`${hiddenFinished} finished`); }
            lines.push(truncate(
              `${theme.fg("dim", "└─")} ${theme.fg("dim", `+${hiddenRunning + hiddenQueued + hiddenFinished} more (${overflowParts.join(", ")})`)}` 
            ));
          }
        }

        return {
          render: (renderWidth?: number) => {
            if (renderWidth == null || renderWidth >= w) {
              return lines;
            }
            // Terminal narrowed since lines were built - re-truncate to avoid TUI crash
            return lines.map((line) => truncateToWidth(line, renderWidth));
          },
          invalidate: () => {},
        };
      },
      { placement: "aboveEditor" }
    );
  }

  dispose() {
    if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = undefined;
    }
    if (this.uiCtx) {
      this.uiCtx.setWidget("agents", undefined);
      this.uiCtx.setStatus("subagents", undefined);
    }
  }
}
