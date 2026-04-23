/**
 * agent-detail-overlay.ts — Ctrl+N overlay showing prompt + live messages for a running agent.
 *
 * Ported from ross-jill-ws/pi-subagent-in-memory, adapted to the subprocess agent model.
 */

import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { Theme } from "./agent-widget.js";
import { formatElapsed } from "./tui-draw.js";

export interface AgentDetailCard {
  num: number;
  title: string;
  modelLabel: string;
  status: "queued" | "running" | "completed" | "error" | "stopped" | "aborted" | "steered";
  prompt: string;
  messages: string;
  startedAt: number;
  endedAt?: number;
}

function getStatusIcon(status: AgentDetailCard["status"]): string {
  if (status === "queued") {
    return "⏳";
  }
  if (status === "running") {
    return "⚡";
  }
  if (status === "completed") {
    return "✅";
  }
  if (status === "stopped") {
    return "■";
  }
  if (status === "steered") {
    return "⚠";
  }
  return "❌";
}

export class AgentDetailOverlay {
  focused = false;
  private readonly card: AgentDetailCard;
  private readonly theme: Theme;
  private readonly done: () => void;

  constructor(card: AgentDetailCard, theme: Theme, done: () => void) {
    this.card = card;
    this.theme = theme;
    this.done = done;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "return")) {
      this.done();
    }
  }

  render(width: number): string[] {
    const th = this.theme;
    const sa = this.card;
    const innerW = Math.max(0, width - 2);

    const pad = (s: string, len: number) =>
      `${s}${" ".repeat(Math.max(0, len - visibleWidth(s)))}`;

    const row = (content: string) =>
      `${th.fg("border", "│")}${pad(content, innerW)}${th.fg("border", "│")}`;

    const divider = () => th.fg("border", `├${"─".repeat(innerW)}┤`);

    const lines: string[] = [];

    lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

    const icon = getStatusIcon(sa.status);
    const headerText = ` ${icon} Agent #${sa.num}: ${sa.title} [${sa.modelLabel}]`;
    lines.push(row(th.fg("accent", th.bold(truncateToWidth(headerText, innerW)))));
    lines.push(row(th.fg("dim", ` ${formatElapsed(sa.startedAt, sa.endedAt)} elapsed`)));

    lines.push(divider());
    lines.push(row(th.fg("accent", " TASK")));

    const promptWrapWidth = Math.max(1, innerW - 2);
    const promptLines = wrapTextWithAnsi(sa.prompt, promptWrapWidth);
    const PROMPT_MIN = 3;
    const PROMPT_MAX = 5;
    const promptDisplay = promptLines.slice(0, PROMPT_MAX);
    for (const pl of promptDisplay) {
      lines.push(row(` ${th.fg("text", truncateToWidth(pl, innerW - 1))}`));
    }
    for (let r = promptDisplay.length; r < PROMPT_MIN; r++) {
      lines.push(row(""));
    }
    if (promptLines.length > PROMPT_MAX) {
      lines.push(row(th.fg("dim", ` … (${promptLines.length - PROMPT_MAX} more lines)`)));
    }

    lines.push(divider());
    lines.push(row(th.fg("accent", " ACTIVITY")));

    const MSG_VISIBLE = 5;
    const msgText = sa.messages || "(no messages yet)";
    const allMsgLines = msgText.split("\n");
    const msgStart = Math.max(0, allMsgLines.length - MSG_VISIBLE);
    const visibleMsgLines = allMsgLines.slice(msgStart);
    for (const ml of visibleMsgLines) {
      lines.push(row(` ${th.fg("muted", truncateToWidth(ml, innerW - 1))}`));
    }
    for (let r = visibleMsgLines.length; r < MSG_VISIBLE; r++) {
      lines.push(row(""));
    }
    if (allMsgLines.length > MSG_VISIBLE) {
      lines.push(row(th.fg("dim", ` … ${allMsgLines.length - MSG_VISIBLE} earlier lines hidden`)));
    }

    const hint = ` Esc / Ctrl+${sa.num} `;
    const dashBefore = Math.max(0, innerW - hint.length);
    lines.push(
      `${th.fg("border", `╰${"─".repeat(dashBefore)}`)}${th.fg("dim", hint)}${th.fg("border", "╯")}`,
    );

    return lines;
  }

  invalidate(): void {
    // no cached state
  }

  dispose(): void {
    // no cleanup needed
  }
}
