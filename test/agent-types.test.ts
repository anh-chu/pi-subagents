import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCustomAgents,
  getCustomAgentConfig,
  getAvailableTypes,
  getCustomAgentNames,
  isValidType,
  getConfig,
  getToolsForType,
  BUILTIN_TOOL_NAMES,
} from "../src/agent-types.js";
import type { CustomAgentConfig } from "../src/types.js";

function makeCustomConfig(overrides: Partial<CustomAgentConfig> = {}): CustomAgentConfig {
  return {
    name: "test-agent",
    description: "Test agent",
    builtinToolNames: ["read", "grep"],
    extensions: false,
    skills: false,
    systemPrompt: "You are a test agent.",
    promptMode: "replace",
    inheritContext: false,
    runInBackground: false,
    isolated: false,
    ...overrides,
  };
}

describe("agent type registry", () => {
  beforeEach(() => {
    registerCustomAgents(new Map());
  });

  describe("built-in types", () => {
    it("recognizes all built-in types", () => {
      expect(isValidType("general-purpose")).toBe(true);
      expect(isValidType("Explore")).toBe(true);
      expect(isValidType("Plan")).toBe(true);
      expect(isValidType("statusline-setup")).toBe(true);
      expect(isValidType("claude-code-guide")).toBe(true);
    });

    it("rejects unknown types", () => {
      expect(isValidType("nonexistent")).toBe(false);
      expect(isValidType("")).toBe(false);
    });

    it("returns correct config for built-in types", () => {
      const config = getConfig("general-purpose");
      expect(config.displayName).toBe("Agent");
      expect(config.builtinToolNames).toEqual(BUILTIN_TOOL_NAMES);
      expect(config.extensions).toBe(true);
      expect(config.skills).toBe(true);
    });

    it("returns tools for built-in types", () => {
      const tools = getToolsForType("statusline-setup", "/tmp");
      expect(tools).toHaveLength(2); // read, edit
    });

    it("Explore has read-only tools", () => {
      const config = getConfig("Explore");
      expect(config.builtinToolNames).toEqual(["read", "bash", "grep", "find", "ls"]);
      expect(config.builtinToolNames).not.toContain("edit");
      expect(config.builtinToolNames).not.toContain("write");
    });

    it("BUILTIN_TOOL_NAMES is derived from factory keys", () => {
      expect(BUILTIN_TOOL_NAMES).toContain("read");
      expect(BUILTIN_TOOL_NAMES).toContain("bash");
      expect(BUILTIN_TOOL_NAMES).toContain("edit");
      expect(BUILTIN_TOOL_NAMES).toContain("write");
      expect(BUILTIN_TOOL_NAMES).toContain("grep");
      expect(BUILTIN_TOOL_NAMES).toContain("find");
      expect(BUILTIN_TOOL_NAMES).toContain("ls");
      expect(BUILTIN_TOOL_NAMES.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe("custom agents", () => {
    it("registers and retrieves custom agents", () => {
      const agents = new Map([["auditor", makeCustomConfig({ name: "auditor", description: "Auditor" })]]);
      registerCustomAgents(agents);

      expect(isValidType("auditor")).toBe(true);
      expect(getCustomAgentConfig("auditor")?.description).toBe("Auditor");
    });

    it("includes custom agents in available types", () => {
      const agents = new Map([["auditor", makeCustomConfig({ name: "auditor" })]]);
      registerCustomAgents(agents);

      const types = getAvailableTypes();
      expect(types).toContain("general-purpose");
      expect(types).toContain("Explore");
      expect(types).toContain("auditor");
    });

    it("lists custom agent names separately", () => {
      const agents = new Map([
        ["auditor", makeCustomConfig({ name: "auditor" })],
        ["reviewer", makeCustomConfig({ name: "reviewer" })],
      ]);
      registerCustomAgents(agents);

      const names = getCustomAgentNames();
      expect(names).toEqual(["auditor", "reviewer"]);
      expect(names).not.toContain("general-purpose");
    });

    it("getConfig returns SubagentTypeConfig for custom agents", () => {
      const agents = new Map([["auditor", makeCustomConfig({
        name: "auditor",
        description: "Security auditor",
        builtinToolNames: ["read", "grep"],
        extensions: false,
        skills: true,
      })]]);
      registerCustomAgents(agents);

      const config = getConfig("auditor");
      expect(config.displayName).toBe("auditor");
      expect(config.description).toBe("Security auditor");
      expect(config.builtinToolNames).toEqual(["read", "grep"]);
      expect(config.extensions).toBe(false);
      expect(config.skills).toBe(true);
    });

    it("getConfig returns extension allowlist for custom agents", () => {
      const agents = new Map([["partial", makeCustomConfig({
        name: "partial",
        extensions: ["web-search"],
        skills: ["planning"],
      })]]);
      registerCustomAgents(agents);

      const config = getConfig("partial");
      expect(config.extensions).toEqual(["web-search"]);
      expect(config.skills).toEqual(["planning"]);
    });

    it("getToolsForType works for custom agents", () => {
      const agents = new Map([["auditor", makeCustomConfig({
        name: "auditor",
        builtinToolNames: ["read", "grep", "find"],
      })]]);
      registerCustomAgents(agents);

      const tools = getToolsForType("auditor", "/tmp");
      expect(tools).toHaveLength(3);
    });

    it("getConfig falls back to general-purpose for unknown types", () => {
      const config = getConfig("nonexistent");
      expect(config.displayName).toBe("Agent");
      expect(config.description).toBe("General-purpose agent for complex, multi-step tasks");
    });

    it("clearing custom agents works", () => {
      const agents = new Map([["auditor", makeCustomConfig({ name: "auditor" })]]);
      registerCustomAgents(agents);
      expect(isValidType("auditor")).toBe(true);

      registerCustomAgents(new Map());
      expect(isValidType("auditor")).toBe(false);
    });

    it("getCustomAgentConfig returns undefined for built-in types", () => {
      expect(getCustomAgentConfig("general-purpose")).toBeUndefined();
      expect(getCustomAgentConfig("Explore")).toBeUndefined();
    });
  });
});
