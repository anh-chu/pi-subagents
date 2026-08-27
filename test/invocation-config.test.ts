import { describe, expect, it } from "vitest";
import { resolveAgentInvocationConfig, resolveContextMode, resolveJoinMode } from "../src/invocation-config.js";
import type { AgentConfig } from "../src/types.js";

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "Explore",
    description: "Explore",
    builtinToolNames: ["read"],
    extensions: false,
    skills: false,
    systemPrompt: "Test agent",
    promptMode: "replace",
    ...overrides,
  };
}

describe("resolveAgentInvocationConfig", () => {
  it("prefers agent config over tool-call params for locked fields", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        model: "provider/config-model",
        lockModel: true,
        thinking: "high",
        maxTurns: 42,
        inheritContext: false,
        runInBackground: false,
        
        isolation: "worktree",
      }),
      {
        model: "provider/param-model",
        thinking: "minimal",
        max_turns: 1,
        inherit_context: true,
        run_in_background: false,
        isolation: "worktree",
      },
    );

    expect(resolved.modelInput).toBe("provider/config-model");
    expect(resolved.modelFromParams).toBe(false);
    expect(resolved.thinking).toBe("high");
    expect(resolved.maxTurns).toBe(42);
    expect(resolved.inheritContext).toBe(false);
    // Deprecated: blocking synchronous subagents always resolve to background.
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("uses tool-call params when no agent config is available", () => {
    const resolved = resolveAgentInvocationConfig(undefined, {
      model: "provider/param-model",
      thinking: "minimal",
      max_turns: 3,
      inherit_context: true,
      run_in_background: true,
      isolation: "worktree",
    });

    expect(resolved.modelInput).toBe("provider/param-model");
    expect(resolved.modelFromParams).toBe(true);
    expect(resolved.thinking).toBe("minimal");
    expect(resolved.maxTurns).toBe(3);
    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("lets parent fill in booleans when config leaves them undefined", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        inheritContext: undefined,
        runInBackground: undefined,
      }),
      {
        inherit_context: true,
        run_in_background: true,
        isolation: "worktree",
      },
    );

    expect(resolved.inheritContext).toBe(true);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolation).toBe("worktree");
  });

  it("defaults inheritContext to false, runInBackground to true, isolation to undefined when neither config nor params set them", () => {
    const resolved = resolveAgentInvocationConfig(
      makeConfig({
        inheritContext: undefined,
        runInBackground: undefined,
      }),
      {},
    );

    expect(resolved.inheritContext).toBe(false);
    expect(resolved.runInBackground).toBe(true);
    expect(resolved.isolation).toBeUndefined();
  });
});

describe("resolveContextMode", () => {
  it("defaults to fresh", () => {
    expect(resolveContextMode(undefined, {})).toBe("fresh");
  });

  it("maps legacy inherit_context param to transcript", () => {
    expect(resolveContextMode(undefined, { inherit_context: true })).toBe("transcript");
  });

  it("maps legacy config inheritContext to transcript", () => {
    expect(resolveContextMode(makeConfig({ inheritContext: true }), {})).toBe("transcript");
  });

  it("explicit context param wins over legacy inherit_context", () => {
    expect(resolveContextMode(undefined, { context: "fork", inherit_context: true })).toBe("fork");
  });

  it("explicit context param overrides config inheritContext", () => {
    expect(resolveContextMode(makeConfig({ inheritContext: true }), { context: "fresh" })).toBe("fresh");
  });

  it("config context applies when no param given", () => {
    expect(resolveContextMode(makeConfig({ context: "fork" }), {})).toBe("fork");
  });

  it("param context overrides config context", () => {
    expect(resolveContextMode(makeConfig({ context: "transcript" }), { context: "fork" })).toBe("fork");
  });
});

describe("resolveJoinMode", () => {
  it("returns the global default for background agents", () => {
    expect(resolveJoinMode("smart", true)).toBe("smart");
    expect(resolveJoinMode("async", true)).toBe("async");
  });

  it("ignores join mode for foreground agents", () => {
    expect(resolveJoinMode("smart", false)).toBeUndefined();
    expect(resolveJoinMode("group", false)).toBeUndefined();
  });
});
