import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("Reviewer defects - regression tests", () => {
  describe("4. Cleanup - em dash and trailing whitespace", () => {
    it("README.md line 1511 should not have em dash and should have colon", () => {
      const readmePath = join(import.meta.dirname || ".", "..", "README.md");
      const content = readFileSync(readmePath, "utf-8");
      const lines = content.split("\n");
      const line1511 = lines[1547]; // 0-indexed (line numbers are 1-indexed, so 1548-1 = 1547)

      // Should not have em dash (—)
      expect(line1511).not.toContain("—");
      // Should have the guidelines placeholder
      expect(line1511).toContain("`{{guidelines}}`");
      // Should have colon instead of em dash
      expect(line1511).toContain(":");
    });
  });

  describe("3. MAJOR - orchestrator prompt contradiction", () => {
    it("orchestrator should not mention direct file reading", () => {
      const defaultAgentsPath = join(import.meta.dirname || ".", "..", "src", "default-agents.ts");
      const content = readFileSync(defaultAgentsPath, "utf-8");

      // Find the orchestrator's system prompt (the one with Active Supervision)
      const activeSuperStart = content.indexOf("# Orchestrator: Active Supervision");
      const nextConfigStart = content.indexOf("Output Contract:", activeSuperStart);
      const orchestratorPrompt = content.substring(activeSuperStart, nextConfigStart + 300);

      // Should NOT contain the phrase about reading files directly
      expect(orchestratorPrompt).not.toContain("reading modified files yourself");
      // Should still mention reviewer dispatch
      expect(orchestratorPrompt).toContain("reviewer dispatch");
    });
  });

  describe("2. MAJOR - fabric detection (correct package name)", () => {
    it("should use correct pi-fabric package name in source", () => {
      const indexPath = join(import.meta.dirname || ".", "..", "src", "index.ts");
      const content = readFileSync(indexPath, "utf-8");

      // Should resolve via ESM import condition (exports map has no "require" condition)
      expect(content).toContain("import.meta.resolve('pi-fabric')");
      // Should fall back to checking the global pi extension install dir
      expect(content).toContain("join(getAgentDir(), 'npm', 'node_modules', 'pi-fabric')");
    });
  });

  describe("1. BLOCKER - stale model catalog (fresh descriptions at session_start)", () => {
    it("should rebuild model list at session_start", () => {
      const indexPath = join(import.meta.dirname || ".", "..", "src", "index.ts");
      const content = readFileSync(indexPath, "utf-8");

      // Should have a registerAgentTool function
      expect(content).toContain("const registerAgentTool = ()");
      // Should call it at session_start
      expect(content).toContain("registerAgentTool()");
      // Session start handler should call registerAgentTool
      const sessionStartMatch = content.match(/pi\.on\(\s*"session_start"[^}]*registerAgentTool[^}]*\}/s);
      expect(sessionStartMatch).toBeDefined();
    });

    it("should not truncate model list at 15 models", () => {
      const indexPath = join(import.meta.dirname || ".", "..", "src", "index.ts");
      const content = readFileSync(indexPath, "utf-8");

      // Find buildModelListText function
      const buildModelMatch = content.match(/const buildModelListText = \(\)[^}]*?return.*?\};/s);
      expect(buildModelMatch).toBeDefined();
      const buildModelText = buildModelMatch![0];

      // Should NOT have .slice(0, 15)
      expect(buildModelText).not.toContain(".slice(0, 15)");
      // Should mention total count for long lists
      expect(buildModelText).toContain("modelIds.length > 15");
    });
  });
});
