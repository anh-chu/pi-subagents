import { describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";
import {
  type AgentActivity,
  AgentWidget,
  type Theme,
  type UICtx,
} from "../src/ui/agent-widget.js";

const theme: Theme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

describe("AgentWidget", () => {
  it("shows running model and thinking level in status text and widget line", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:05Z"));

    const agent: AgentRecord = {
      id: "agent-1",
      type: "general-purpose",
      description: "Investigate bug",
      status: "running",
      modelName: "haiku",
      thinkingLevel: "high",
      toolUses: 1,
      startedAt: Date.parse("2026-04-13T12:00:00Z"),
    };

    const activity = new Map<string, AgentActivity>([
      [
        "agent-1",
        {
          activeTools: new Map(),
          toolUses: 1,
          tokens: "",
          responseText: "Tracing the root cause",
          turnCount: 2,
          maxTurns: 10,
        },
      ],
    ]);

    let statusText: string | undefined;
    let widgetFactory:
      | Exclude<Parameters<UICtx["setWidget"]>[1], undefined>
      | undefined;

    const uiCtx: UICtx = {
      setStatus: (_key, text) => {
        statusText = text;
      },
      setWidget: (_key, content) => {
        widgetFactory = content;
      },
    };

    const manager = {
      listAgents: () => [agent],
    } as any;

    const widget = new AgentWidget(manager, activity);
    widget.setUICtx(uiCtx);
    widget.update();

    expect(statusText).toBe("1 running agent · haiku:high");

    expect(widgetFactory).toBeDefined();
    const rendered = widgetFactory!(
      { terminal: { columns: 200 } },
      theme
    ).render();
    expect(rendered.some((line) => line.includes("haiku:high"))).toBe(true);

    vi.useRealTimers();
  });

  it("restarts interval after transient empty state", () => {
    vi.useFakeTimers();

    const agent: AgentRecord = {
      id: "agent-1",
      type: "general-purpose",
      description: "Task",
      status: "running",
      toolUses: 0,
      startedAt: Date.now(),
    };

    const activity = new Map<string, AgentActivity>();

    const uiCtx: UICtx = {
      setStatus: vi.fn(),
      setWidget: vi.fn(),
    };

    const manager = {
      listAgents: () => [],
    } as any;

    const widget = new AgentWidget(manager, activity);
    widget.setUICtx(uiCtx);

    // First update with no agents — interval should be killed
    widget.update();
    expect((widget as any).widgetInterval).toBeUndefined();

    // Agents reappear
    manager.listAgents = () => [agent];
    widget.update();

    // Interval must be running again
    expect((widget as any).widgetInterval).toBeDefined();

    vi.useRealTimers();
  });

  it("ensureTimer is idempotent when interval already running", () => {
    vi.useFakeTimers();

    const agent: AgentRecord = {
      id: "agent-2",
      type: "general-purpose",
      description: "Task",
      status: "running",
      toolUses: 0,
      startedAt: Date.now(),
    };

    const activity = new Map<string, AgentActivity>();

    const uiCtx: UICtx = {
      setStatus: vi.fn(),
      setWidget: vi.fn(),
    };

    const manager = {
      listAgents: () => [agent],
    } as any;

    const widget = new AgentWidget(manager, activity);
    widget.setUICtx(uiCtx);

    widget.update();
    const first = (widget as any).widgetInterval;
    expect(first).toBeDefined();

    // Second update must not replace interval
    widget.update();
    expect((widget as any).widgetInterval).toBe(first);

    vi.useRealTimers();
  });
});
