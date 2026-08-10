import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AgentModeEntryData,
  buildAgentModePrompt,
  clearAgentMode,
  enterAgentMode,
  getAgentMode,
  registerAgentModeCommands,
  resolveAgentModeModel,
  resolveAgentModeTools,
  setAgentMode,
} from "../src/agent-mode.js";
import { registerAgents } from "../src/agent-types.js";
import type { AgentConfig } from "../src/types.js";

beforeEach(() => {
  clearAgentMode();
  registerAgents(new Map());
});

const baseConfig = (overrides: Partial<AgentConfig>): AgentConfig => ({
  name: "test-agent",
  description: "Test agent",
  systemPrompt: "You are a test agent.",
  promptMode: "replace",
  builtinToolNames: ["read", "bash"],
  extensions: true,
  skills: false,
  ...overrides,
});

function fakeSessionStartCtx(overrides: { entries?: any[]; notify?: boolean } = {}) {
  return {
    sessionManager: {
      appendCustomEntry: vi.fn(),
      appendCustomMessageEntry: vi.fn(),
      getEntries: vi.fn(() => overrides.entries ?? []),
    },
    ui: {
      notify: overrides.notify !== false ? vi.fn() : undefined,
      setWidget: vi.fn(),
      setStatus: vi.fn(),
      addAutocompleteProvider: vi.fn(),
    },
    cwd: "/workspace",
    modelRegistry: {
      find: vi.fn((provider: string, modelId: string) => ({ id: modelId, provider })),
      getAvailable: vi.fn(() => [{ id: "sonnet", provider: "anthropic", name: "Sonnet" }]),
    },
  };
}

function fakePiWithTools() {
  const sessionStartHandlers: Array<(event: any, ctx: any) => Promise<void>> = [];
  return {
    exec: vi.fn(async (_cmd: string, args: string[]) => {
      if (args.includes("--is-inside-work-tree")) return { code: 0, stdout: "true\n", stderr: "", killed: false };
      if (args.includes("--show-current")) return { code: 0, stdout: "main\n", stderr: "", killed: false };
      return { code: 0, stdout: "", stderr: "", killed: false };
    }),
    setModel: vi.fn(async () => true),
    setThinkingLevel: vi.fn(),
    setActiveTools: vi.fn(),
    appendEntry: vi.fn(),
    getAllTools: vi.fn(() => [
      { name: "read" },
      { name: "bash" },
      { name: "edit" },
    ]),
    modelRegistry: {
      find: vi.fn((provider: string, modelId: string) => ({ id: modelId, provider })),
      getAvailable: vi.fn(() => [{ id: "sonnet", provider: "anthropic", name: "Sonnet" }]),
    },
    on: vi.fn((event: string, handler: (event: any, ctx: any) => Promise<void>) => {
      if (event === "session_start") sessionStartHandlers.push(handler);
    }),
    registerCommand: vi.fn(),
    _sessionStartHandlers: sessionStartHandlers,
  } as unknown as ExtensionAPI;
}

describe("agent mode state", () => {
  it("starts empty", () => {
    const state = getAgentMode();
    expect(state).toEqual({});
  });

  it("sets and gets active agent", () => {
    setAgentMode({ activeAgent: "worker", displayName: "Worker" });
    expect(getAgentMode()).toEqual({ activeAgent: "worker", displayName: "Worker" });
  });

  it("clears state", () => {
    setAgentMode({ activeAgent: "worker", displayName: "Worker" });
    clearAgentMode();
    expect(getAgentMode()).toEqual({});
  });

  it("stores and retrieves system prompt", () => {
    const prompt = "You are a helpful assistant.";
    setAgentMode({ activeAgent: "worker", displayName: "Worker", systemPrompt: prompt });
    expect(getAgentMode().systemPrompt).toBe(prompt);
  });
});

describe("resolveAgentModeModel", () => {
  const registry = {
    find: vi.fn((provider: string, modelId: string) => ({ id: modelId, provider })),
    getAvailable: vi.fn(() => [
      { id: "sonnet", name: "Sonnet", provider: "anthropic" },
      { id: "haiku", name: "Haiku", provider: "anthropic" },
    ]),
  };

  beforeEach(() => {
    registry.find.mockClear();
    registry.getAvailable.mockClear();
  });

  it("returns parent model when config.model is absent", () => {
    const config = baseConfig({ model: undefined });
    const parent = { id: "parent", provider: "openai" };
    expect(resolveAgentModeModel(config, parent, registry)).toBe(parent);
  });

  it("returns resolved model when config.model is present", () => {
    const config = baseConfig({ model: "anthropic/sonnet" });
    const result = resolveAgentModeModel(config, null, registry);
    expect(result).toEqual({ id: "sonnet", provider: "anthropic" });
  });

  it("returns error string when model cannot be resolved", () => {
    const config = baseConfig({ model: "unknown/model" });
    const result = resolveAgentModeModel(config, null, registry);
    expect(typeof result).toBe("string");
    expect(result as string).toContain("Model not found");
  });
});

describe("resolveAgentModeTools", () => {
  function fakeTool(name: string, origin?: string, source?: string, path?: string) {
    return { name, sourceInfo: origin ? { origin, source, path } : undefined };
  }

  function fakeCtx(tools: ReturnType<typeof fakeTool>[]) {
    return { getAllTools: () => tools };
  }

  it("includes built-ins only when extensions is false", async () => {
    const config = baseConfig({ extensions: false });
    const ctx = fakeCtx([
      fakeTool("ext-tool", "package", "some-ext"),
      fakeTool("read"),
      fakeTool("bash"),
    ]);
    const tools = await resolveAgentModeTools({} as ExtensionAPI, config, ctx);
    expect(tools.sort()).toEqual(["bash", "read"]);
  });

  it("includes all extension tools when extensions is true", async () => {
    const config = baseConfig({ extensions: true });
    const ctx = fakeCtx([
      fakeTool("read"),
      fakeTool("bash"),
      fakeTool("ext-tool", "package", "some-ext"),
      fakeTool("top-tool", "top-level", "top-ext"),
    ]);
    const tools = await resolveAgentModeTools({} as ExtensionAPI, config, ctx);
    expect(tools.sort()).toEqual(["bash", "ext-tool", "read", "top-tool"]);
  });

  it("includes no extension tools when extensions is false", async () => {
    const config = baseConfig({ extensions: false });
    const ctx = fakeCtx([
      fakeTool("read"),
      fakeTool("bash"),
      fakeTool("ext-tool", "package", "some-ext"),
    ]);
    const tools = await resolveAgentModeTools({} as ExtensionAPI, config, ctx);
    expect(tools.sort()).toEqual(["bash", "read"]);
  });

  it("filters extension tools by allowlist when extensions is a string array", async () => {
    const config = baseConfig({ extensions: ["allowed-ext"] });
    const ctx = fakeCtx([
      fakeTool("read"),
      fakeTool("bash"),
      fakeTool("good-tool", "package", "allowed-ext", "allowed-ext/good-tool.ts"),
      fakeTool("bad-tool", "package", "other-ext"),
    ]);
    const tools = await resolveAgentModeTools({} as ExtensionAPI, config, ctx);
    expect(tools.sort()).toEqual(["bash", "good-tool", "read"]);
  });

  it("excludes disallowed tools", async () => {
    const config = baseConfig({ extensions: false, disallowedTools: ["bash"] });
    const ctx = fakeCtx([fakeTool("read"), fakeTool("bash")]);
    const tools = await resolveAgentModeTools({} as ExtensionAPI, config, ctx);
    expect(tools.sort()).toEqual(["read"]);
  });

  it("drops unknown tools", async () => {
    const config = baseConfig({ extensions: false, builtinToolNames: ["read", "unknown-tool"] });
    const ctx = fakeCtx([fakeTool("read"), fakeTool("bash")]);
    const tools = await resolveAgentModeTools({} as ExtensionAPI, config, ctx);
    expect(tools.sort()).toEqual(["read"]);
  });
});

describe("buildAgentModePrompt", () => {
  it("returns a prompt containing the agent system prompt and active_agent tag", async () => {
    const config = baseConfig({ name: "test-agent", systemPrompt: "You are a test agent." });
    const pi = {
      exec: vi.fn(async (_cmd: string, args: string[]) => {
        if (args.includes("--is-inside-work-tree")) {
          return { code: 0, stdout: "true\n", stderr: "", killed: false };
        }
        if (args.includes("--show-current")) {
          return { code: 0, stdout: "main\n", stderr: "", killed: false };
        }
        return { code: 0, stdout: "", stderr: "", killed: false };
      }),
    } as unknown as ExtensionAPI;

    const prompt = await buildAgentModePrompt(pi, config, "/workspace");
    expect(prompt).toContain("test-agent");
    expect(prompt).toContain("<active_agent name=\"test-agent\"/>");
    expect(prompt).toContain("You are a test agent.");
  });

  it("for append-mode agent: includes agent_instructions, excludes inherited_system_prompt and sub_agent_context", async () => {
    const config: AgentConfig = {
      name: "append-agent",
      description: "Append agent",
      systemPrompt: "Custom append-mode instructions.",
      promptMode: "append",
      builtinToolNames: ["read"],
      extensions: true,
      skills: false,
      inheritContext: false,
      runInBackground: false,
      isolated: false,
    };
    const pi = {
      exec: vi.fn(async (_cmd: string, args: string[]) => {
        if (args.includes("--is-inside-work-tree")) {
          return { code: 0, stdout: "true\n", stderr: "", killed: false };
        }
        if (args.includes("--show-current")) {
          return { code: 0, stdout: "main\n", stderr: "", killed: false };
        }
        return { code: 0, stdout: "", stderr: "", killed: false };
      }),
    } as unknown as ExtensionAPI;

    const prompt = await buildAgentModePrompt(pi, config, "/workspace");
    expect(prompt).toContain("<active_agent name=\"append-agent\"/>");
    expect(prompt).toContain("<agent_instructions>");
    expect(prompt).toContain("Custom append-mode instructions.");
    expect(prompt).not.toContain("<inherited_system_prompt>");
    expect(prompt).not.toContain("<sub_agent_context>");
    expect(prompt).not.toContain("general-purpose coding agent");
  });
});

describe("enterAgentMode", () => {
  function fakeCtx(overrides: Partial<ExtensionCommandContext> & { confirmValue?: boolean } = {}): ExtensionCommandContext {
    const sentMessages: any[] = [];
    const setupCalls: any[] = [];
    const ctx = {
      cwd: "/workspace",
      model: { id: "parent", provider: "openai" },
      modelRegistry: {
        find: vi.fn((provider: string, modelId: string) => ({ id: modelId, provider })),
        getAvailable: vi.fn(() => [{ id: "sonnet", provider: "anthropic", name: "Sonnet" }]),
      },
      sessionManager: {
        getSessionFile: vi.fn(() => "/session/parent"),
        getSessionId: vi.fn(() => "parent-session-id"),
        getEntries: vi.fn(() => []),
      },
      newSession: vi.fn(async ({ setup, withSession }: { setup?: (sm: any) => Promise<void>; withSession: (replacementCtx: any) => Promise<void> }) => {
        const fakeSm = {
          appendModelChange: vi.fn((provider: string, modelId: string) => setupCalls.push({ type: "model_change", data: { provider, modelId } })),
          appendCustomEntry: vi.fn((type: string, data: any) => setupCalls.push({ type, data })),
          appendCustomMessageEntry: vi.fn((type: string, content: any, display: boolean) => setupCalls.push({ type, content, display })),
        };
        if (setup) await setup(fakeSm);
        const replacementCtx = fakeReplacementCtx(sentMessages);
        await withSession(replacementCtx);
        return { cancelled: false };
      }),
      ui: {
        confirm: vi.fn(async () => overrides.confirmValue ?? true),
        notify: vi.fn(),
        setEditorText: vi.fn(),
      },
      _sentMessages: sentMessages,
      ...overrides,
    };
    return ctx as unknown as ExtensionCommandContext;
  }

  function fakeReplacementCtx(sentMessages: any[]) {
    return {
      ui: {
        setEditorText: vi.fn(),
        notify: vi.fn(),
        setWidget: vi.fn(),
        setStatus: vi.fn(),
      },
      sendMessage: vi.fn(async (msg: any, _opts: any) => {
        sentMessages.push(msg);
      }),
    };
  }

  function fakePi() {
    return {
      exec: vi.fn(async (_cmd: string, args: string[]) => {
        if (args.includes("--is-inside-work-tree")) return { code: 0, stdout: "true\n", stderr: "", killed: false };
        if (args.includes("--show-current")) return { code: 0, stdout: "main\n", stderr: "", killed: false };
        return { code: 0, stdout: "", stderr: "", killed: false };
      }),
      setModel: vi.fn(async () => true),
      setThinkingLevel: vi.fn(),
      setActiveTools: vi.fn(),
      appendEntry: vi.fn(),
      registerCommand: vi.fn(),
      getAllTools: vi.fn(() => [
        { name: "read" },
        { name: "bash" },
        { name: "edit" },
      ]),
    } as unknown as ExtensionAPI;
  }

  it("errors for unknown agent", async () => {
    const pi = fakePi();
    const ctx = fakeCtx();
    await enterAgentMode(pi, ctx, "does-not-exist");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Unknown agent type"), "error");
  });

  it("warns for disabled agent", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["disabled-agent", baseConfig({ name: "disabled-agent", enabled: false })],
    ]);
    registerAgents(userAgents);

    const pi = fakePi();
    const ctx = fakeCtx();
    await enterAgentMode(pi, ctx, "disabled-agent");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("disabled"), "warning");
  });

  it("returns early when user cancels", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["test-agent", baseConfig({ name: "test-agent" })],
    ]);
    registerAgents(userAgents);

    const pi = fakePi();
    const ctx = fakeCtx({ confirmValue: false });
    await enterAgentMode(pi, ctx, "test-agent");
    expect(ctx.ui.confirm).toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("cancelled"), "info");
    expect(ctx.newSession).not.toHaveBeenCalled();
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it("confirms the prompt warns about a fresh session", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["test-agent", baseConfig({ name: "test-agent" })],
    ]);
    registerAgents(userAgents);

    const pi = fakePi();
    const ctx = fakeCtx();
    await enterAgentMode(pi, ctx, "test-agent");
    const confirmCall = (ctx.ui.confirm as any).mock.calls[0] as string[];
    const message = confirmCall.join(" ");
    expect(message).toContain("brand-new session");
    expect(message).toContain("Nothing carries over automatically");
  });

  it("success path configures replacement session", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["test-agent", baseConfig({ name: "test-agent", model: "anthropic/sonnet", thinking: "low" as any })],
    ]);
    registerAgents(userAgents);

    const pi = fakePi();
    const sessionStartHandlers: Array<(event: any, ctx: any) => Promise<void> | void> = [];
    (pi as any).on = vi.fn((event: string, handler: (event: any, ctx: any) => Promise<void> | void) => {
      if (event === "session_start") sessionStartHandlers.push(handler);
    });

    const setupCalls: any[] = [];
    const ctx = fakeCtx({
      newSession: vi.fn(async ({ setup, withSession }: { setup: (sm: any) => Promise<void>; withSession: (replacementCtx: any) => Promise<void> }) => {
        if (setup) {
          const fakeSm = {
            appendCustomEntry: vi.fn((type: string, data: any) => setupCalls.push({ type, data })),
            appendCustomMessageEntry: vi.fn((type: string, content: any, display: boolean) => setupCalls.push({ type, content, display })),
          };
          await setup(fakeSm);
        }
        const replacementCtx = fakeReplacementCtx([]);
        await withSession(replacementCtx);
        return { cancelled: false };
      }),
    });
    await enterAgentMode(pi, ctx, "test-agent");

    // setup() only persists session-log entries; model/tools/thinking are
    // applied later by the new instance's own session_start handler.
    const configCalls = setupCalls.filter(c => c.type === "agent-mode-config");
    expect(configCalls.length).toBe(1);
    expect(configCalls[0].data).toMatchObject({ agentName: "test-agent" });
    expect(configCalls[0].data.tools.sort()).toEqual(["bash", "read"]);

    const instructionCalls = setupCalls.filter(c => c.type === "agent-mode-instructions");
    expect(instructionCalls.length).toBe(1);
    expect(instructionCalls[0].content).toEqual([{ type: "text", text: expect.stringContaining("You are a test agent") }]);
    expect(instructionCalls[0].display).toBe(false);

    // Simulate the fresh instance registering commands and firing session_start,
    // which is what applies the pending model/tools/thinking switch and registers before_agent_start handler.
    registerAgentModeCommands(pi);
    const fakeNewCtx = { ui: { addAutocompleteProvider: vi.fn(), setWidget: vi.fn(), setStatus: vi.fn(), notify: vi.fn() } };
    for (const handler of sessionStartHandlers) {
      await handler({}, fakeNewCtx);
    }

    expect(pi.setModel).toHaveBeenCalledWith({ id: "sonnet", provider: "anthropic" });
    expect(pi.setThinkingLevel).toHaveBeenCalledWith("low");
    expect(pi.setActiveTools).toHaveBeenCalledWith(expect.arrayContaining(["bash", "read"]));

    expect(getAgentMode()).toEqual({
      activeAgent: "test-agent",
      displayName: "test-agent",
      parentSessionFile: "/session/parent",
      systemPrompt: expect.stringContaining("You are a test agent"),
    });
  });
});

describe("auto-apply default agent mode", () => {
  it("applies default mode on reason:new with no existing config", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true, displayName: "Default" })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    // Simulate session_start with reason:new
    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "new" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).toHaveBeenCalledWith(
      "agent-mode-config",
      expect.objectContaining({ agentName: "default-agent" }),
    );
    expect(ctx.sessionManager.appendCustomMessageEntry).toHaveBeenCalledWith(
      "agent-mode-instructions",
      expect.arrayContaining([expect.objectContaining({ type: "text" })]),
      false,
      undefined,
    );
    expect(pi.setActiveTools).toHaveBeenCalled();
    expect(getAgentMode().activeAgent).toBe("default-agent");
    expect(getAgentMode().systemPrompt).toBeDefined();
  });

  it("persists model and thinking in auto-applied config entry", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["smart-agent", baseConfig({ name: "smart-agent", defaultMode: true, model: "anthropic/sonnet", thinking: "high" })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "new" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).toHaveBeenCalledWith(
      "agent-mode-config",
      expect.objectContaining({
        agentName: "smart-agent",
        modelProvider: "anthropic",
        modelId: "sonnet",
        thinking: "high",
      }),
    );
  });

  it("applies first alphabetically when multiple default agents exist", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["zebra-agent", baseConfig({ name: "zebra-agent", defaultMode: true })],
      ["apple-agent", baseConfig({ name: "apple-agent", defaultMode: true })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "new" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).toHaveBeenCalledWith(
      "agent-mode-config",
      expect.objectContaining({ agentName: "apple-agent" }),
    );
    expect(getAgentMode().activeAgent).toBe("apple-agent");
  });

  it("skips auto-apply when reason is resume", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "resume" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).not.toHaveBeenCalled();
    expect(getAgentMode().activeAgent).toBeUndefined();
  });

  it("skips auto-apply when reason is reload", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "reload" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).not.toHaveBeenCalled();
    expect(getAgentMode().activeAgent).toBeUndefined();
  });

  it("skips auto-apply when agent-mode-config entry already present", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true })],
    ]);
    registerAgents(userAgents);

    const existingEntries = [
      { type: "custom", customType: "agent-mode-config", data: { agentName: "other-agent" } },
    ];
    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx({ entries: existingEntries });

    registerAgentModeCommands(pi);

    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "new" }, ctx);
    }

    // Should not append another config
    expect(ctx.sessionManager.appendCustomEntry).not.toHaveBeenCalled();
    expect(getAgentMode().activeAgent).toBeUndefined();
  });

  it("skips auto-apply when reason is fork", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "fork" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).not.toHaveBeenCalled();
    expect(getAgentMode().activeAgent).toBeUndefined();
  });

  it("applies default mode on reason:startup with no existing config", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true, displayName: "Default" })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    registerAgentModeCommands(pi);

    // Simulate session_start with reason:startup
    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "startup" }, ctx);
    }

    expect(ctx.sessionManager.appendCustomEntry).toHaveBeenCalledWith(
      "agent-mode-config",
      expect.objectContaining({ agentName: "default-agent" }),
    );
    expect(ctx.sessionManager.appendCustomMessageEntry).toHaveBeenCalledWith(
      "agent-mode-instructions",
      expect.arrayContaining([expect.objectContaining({ type: "text" })]),
      false,
      undefined,
    );
    expect(getAgentMode().activeAgent).toBe("default-agent");
  });

  it("skips auto-apply when pendingApply is set", async () => {
    const userAgents = new Map<string, AgentConfig>([
      ["default-agent", baseConfig({ name: "default-agent", defaultMode: true, model: "anthropic/sonnet", thinking: "high" })],
    ]);
    registerAgents(userAgents);

    const pi = fakePiWithTools();
    const ctx = fakeSessionStartCtx();

    // Capture the /agent-mode command handler
    let agentModeHandler: ((args: string, cmdCtx: any) => Promise<void>) | null = null;
    (pi.registerCommand as any) = vi.fn((cmd: string, opts: any) => {
      if (cmd === "agent-mode") {
        agentModeHandler = opts.handler;
      }
    });

    registerAgentModeCommands(pi);

    // Simulate calling /agent-mode worker to set pendingApply
    // Mock ctx.newSession to record that it was called
    const mockCmdCtx: any = {
      cwd: "/workspace",
      ui: { confirm: vi.fn(async () => true), notify: vi.fn() },
      sessionManager: {
        getSessionFile: vi.fn(() => "parent.session"),
        getEntries: vi.fn(() => []),
        getSessionId: vi.fn(() => "session-id"),
      },
      modelRegistry: ctx.modelRegistry,
      newSession: vi.fn(async () => ({
        cancelled: false,
        result: "new-session",
      })),
    };

    // Call the /agent-mode command (this will set pendingApply and call ctx.newSession)
    await agentModeHandler!("default-agent", mockCmdCtx);

    // Now the new session's session_start runs with pendingApply set
    // Reset the mock to track new calls
    (ctx.sessionManager.appendCustomEntry as any).mockClear();
    (pi.setModel as any).mockClear();
    (pi.setActiveTools as any).mockClear();
    (pi.setThinkingLevel as any).mockClear();

    // Fire session_start in the new session context
    for (const handler of (pi as any)._sessionStartHandlers) {
      await handler({ reason: "new" }, ctx);
    }

    // Auto-apply should have been skipped (pendingApply consumed instead)
    expect(ctx.sessionManager.appendCustomEntry).not.toHaveBeenCalled();
    // But the pending apply should have been processed
    expect(pi.setModel).toHaveBeenCalled();
    expect(pi.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(pi.setActiveTools).toHaveBeenCalled();
  });
});

describe("agent-mode-off with auto-applied mode", () => {
  it("clears mode without parent session when auto-applied", async () => {
    setAgentMode({ activeAgent: "default-agent", displayName: "Default" }); // no parentSessionFile

    const pi = fakePiWithTools();
    let agentModeOffHandler: ((args: string, cmdCtx: any) => Promise<void>) | null = null;
    (pi.registerCommand as any) = vi.fn((cmd: string, opts: any) => {
      if (cmd === "agent-mode-off") {
        agentModeOffHandler = opts.handler;
      }
    });

    registerAgentModeCommands(pi);

    const ctx: any = {
      ui: {
        setStatus: vi.fn(),
        setWidget: vi.fn(),
        notify: vi.fn(),
      },
      switchSession: vi.fn(),
    };

    // Call the actual /agent-mode-off handler
    expect(agentModeOffHandler).not.toBeNull();
    await agentModeOffHandler!("", ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("agent-mode-status", undefined);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("agent-mode", undefined);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Agent-mode cleared"),
      "info",
    );
    expect(ctx.switchSession).not.toHaveBeenCalled(); // Should not try to switch
    expect(getAgentMode().activeAgent).toBeUndefined();
  });

  it("writes exit marker on agent-mode-off without parent", async () => {
    setAgentMode({ activeAgent: "default-agent", displayName: "Default" }); // no parentSessionFile

    const pi = fakePiWithTools();
    let agentModeOffHandler: ((args: string, cmdCtx: any) => Promise<void>) | null = null;
    (pi.registerCommand as any) = vi.fn((cmd: string, opts: any) => {
      if (cmd === "agent-mode-off") {
        agentModeOffHandler = opts.handler;
      }
    });

    registerAgentModeCommands(pi);

    const ctx: any = {
      ui: {
        setStatus: vi.fn(),
        setWidget: vi.fn(),
        notify: vi.fn(),
      },
      switchSession: vi.fn(),
    };

    expect(agentModeOffHandler).not.toBeNull();
    await agentModeOffHandler!("", ctx);

    // Should have written exit marker before clearing
    expect(pi.appendEntry).toHaveBeenCalledWith("agent-mode-exit", {});
  });
});

describe("before_agent_start handler", () => {
  it("augments system prompt when agent mode is active", async () => {
    setAgentMode({
      activeAgent: "test-agent",
      displayName: "Test",
      systemPrompt: "You are a test agent.",
    });

    const pi = fakePiWithTools();
    const beforeAgentStartHandlers: Array<(event: any, ctx: any) => Promise<any> | any> = [];
    (pi as any).on = vi.fn((event: string, handler: any) => {
      if (event === "before_agent_start") beforeAgentStartHandlers.push(handler);
    });

    registerAgentModeCommands(pi);

    expect(beforeAgentStartHandlers.length).toBeGreaterThanOrEqual(1);

    const event = { systemPrompt: "Base system prompt." };
    const result = await beforeAgentStartHandlers[0](event, {});

    expect(result).toBeDefined();
    expect(result.systemPrompt).toContain("Base system prompt.");
    expect(result.systemPrompt).toContain("You are a test agent.");
    expect(result.systemPrompt).toContain("\n\n");
  });

  it("returns undefined when agent mode is inactive", async () => {
    clearAgentMode();

    const pi = fakePiWithTools();
    const beforeAgentStartHandlers: Array<(event: any, ctx: any) => Promise<any> | any> = [];
    (pi as any).on = vi.fn((event: string, handler: any) => {
      if (event === "before_agent_start") beforeAgentStartHandlers.push(handler);
    });

    registerAgentModeCommands(pi);

    const event = { systemPrompt: "Base system prompt." };
    const result = await beforeAgentStartHandlers[0](event, {});

    expect(result).toBeUndefined();
  });

  it("returns undefined when system prompt is missing from mode", async () => {
    setAgentMode({ activeAgent: "test-agent", displayName: "Test" });

    const pi = fakePiWithTools();
    const beforeAgentStartHandlers: Array<(event: any, ctx: any) => Promise<any> | any> = [];
    (pi as any).on = vi.fn((event: string, handler: any) => {
      if (event === "before_agent_start") beforeAgentStartHandlers.push(handler);
    });

    registerAgentModeCommands(pi);

    const event = { systemPrompt: "Base system prompt." };
    const result = await beforeAgentStartHandlers[0](event, {});

    expect(result).toBeUndefined();
  });
});

describe("agent-mode resume rehydration", () => {
  function rehydratePi() {
    return {
      on: vi.fn(),
      setModel: vi.fn(async () => true),
      setThinkingLevel: vi.fn(),
      setActiveTools: vi.fn(),
      appendEntry: vi.fn(),
      registerCommand: vi.fn(),
      getAllTools: vi.fn(() => []),
      exec: vi.fn(async (_cmd: string, args: string[]) => {
        if (args.includes("--is-inside-work-tree")) return { code: 0, stdout: "true\n", stderr: "", killed: false };
        if (args.includes("--show-current")) return { code: 0, stdout: "main\n", stderr: "", killed: false };
        return { code: 0, stdout: "", stderr: "", killed: false };
      }),
    } as unknown as ExtensionAPI;
  }

  function rehydrateCtx(entries: any[]) {
    return {
      sessionManager: { getEntries: vi.fn(() => entries) },
      modelRegistry: {
        find: vi.fn((provider: string, modelId: string) =>
          provider === "anthropic" && modelId === "sonnet" ? { id: modelId, provider } : undefined,
        ),
      },
      ui: { setStatus: vi.fn(), setWidget: vi.fn(), notify: vi.fn(), addAutocompleteProvider: vi.fn() },
      cwd: "/workspace",
    };
  }

  function configEntry(data: Partial<AgentModeEntryData> = {}) {
    return {
      type: "custom",
      customType: "agent-mode-config",
      data: {
        agentName: "worker",
        displayName: "Worker",
        systemPrompt: "prompt",
        tools: ["read", "bash"],
        modelProvider: "anthropic",
        modelId: "sonnet",
        thinking: "low",
        parentSessionFile: "/session/parent",
        ...data,
      },
    };
  }

  async function fireSessionStart(pi: ExtensionAPI, ctx: any, reason: string) {
    const handlers: Array<(event: any, hctx: any) => Promise<void> | void> = [];
    (pi as any).on = vi.fn((event: string, handler: any) => {
      if (event === "session_start") handlers.push(handler);
    });
    registerAgentModeCommands(pi);
    for (const handler of handlers) {
      await handler({ reason }, ctx);
    }
  }

  it("rehydrates state, model, tools, thinking, and system prompt on resume", async () => {
    const pi = rehydratePi();
    const ctx = rehydrateCtx([configEntry()]);
    await fireSessionStart(pi, ctx, "resume");

    expect(getAgentMode()).toEqual({
      activeAgent: "worker",
      displayName: "Worker",
      parentSessionFile: "/session/parent",
      systemPrompt: "prompt",
    });
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("agent-mode-status", "Agent: Worker");
    expect(pi.setModel).toHaveBeenCalledWith({ id: "sonnet", provider: "anthropic" });
    expect(pi.setThinkingLevel).toHaveBeenCalledWith("low");
    expect(pi.setActiveTools).toHaveBeenCalledWith(["read", "bash"]);
  });

  it("does not rehydrate when exit marker follows config", async () => {
    const pi = rehydratePi();
    const ctx = rehydrateCtx([configEntry(), { type: "custom", customType: "agent-mode-exit", data: {} }]);
    await fireSessionStart(pi, ctx, "resume");

    expect(getAgentMode()).toEqual({});
    expect(pi.setModel).not.toHaveBeenCalled();
    expect(pi.setActiveTools).not.toHaveBeenCalled();
  });

  it("rehydrates from a config entry written after an earlier exit", async () => {
    const pi = rehydratePi();
    const ctx = rehydrateCtx([
      configEntry({ displayName: "Old" }),
      { type: "custom", customType: "agent-mode-exit", data: {} },
      configEntry({ displayName: "New" }),
    ]);
    await fireSessionStart(pi, ctx, "resume");
    expect(getAgentMode().displayName).toBe("New");
    expect(getAgentMode().systemPrompt).toBe("prompt");
  });

  it("restores system prompt from persisted entry on rehydration", async () => {
    const pi = rehydratePi();
    const persistedPrompt = "You are a rehydrated worker agent.";
    const ctx = rehydrateCtx([configEntry({ systemPrompt: persistedPrompt })]);
    await fireSessionStart(pi, ctx, "resume");

    expect(getAgentMode().systemPrompt).toBe(persistedPrompt);
  });

  it("warns and continues when system prompt cannot be restored on rehydration", async () => {
    const pi = rehydratePi();
    const nonexistentEntry = configEntry({ agentName: "nonexistent-agent", systemPrompt: undefined });
    const ctx = rehydrateCtx([nonexistentEntry]);

    await fireSessionStart(pi, ctx, "resume");

    expect(getAgentMode().activeAgent).toBe("nonexistent-agent");
    expect(getAgentMode().systemPrompt).toBeUndefined();
    expect(pi.appendEntry).toHaveBeenCalledWith(
      "agent-mode-warning",
      expect.objectContaining({
        message: expect.stringContaining("Could not restore system prompt"),
      }),
    );
  });

  it("warns on unresolvable model but still applies tools and thinking", async () => {
    const pi = rehydratePi();
    const ctx = rehydrateCtx([configEntry({ modelProvider: "gone", modelId: "missing" })]);
    await fireSessionStart(pi, ctx, "resume");

    expect(pi.setModel).not.toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledWith(
      "agent-mode-warning",
      expect.objectContaining({ message: expect.stringContaining("gone/missing") }),
    );
    expect(pi.setThinkingLevel).toHaveBeenCalledWith("low");
    expect(pi.setActiveTools).toHaveBeenCalledWith(["read", "bash"]);
  });

  it("does nothing for reason \"new\" without pendingApply", async () => {
    const pi = rehydratePi();
    const ctx = rehydrateCtx([configEntry()]);
    await fireSessionStart(pi, ctx, "new");
    expect(getAgentMode()).toEqual({});
    expect(pi.setModel).not.toHaveBeenCalled();
  });

  it("does not re-append agent-mode instructions on resume", async () => {
    const pi = rehydratePi();
    const ctx = rehydrateCtx([configEntry()]);
    await fireSessionStart(pi, ctx, "resume");
    const appendCalls = (pi.appendEntry as any).mock.calls.filter((call: any[]) => call[0] === "agent-mode-instructions");
    expect(appendCalls.length).toBe(0);
  });
});
