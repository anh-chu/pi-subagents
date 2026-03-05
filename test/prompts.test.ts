import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/prompts.js";
import type { EnvInfo } from "../src/types.js";

const env: EnvInfo = {
  isGitRepo: true,
  branch: "main",
  platform: "darwin",
};

const envNoGit: EnvInfo = {
  isGitRepo: false,
  branch: "",
  platform: "linux",
};

describe("buildSystemPrompt", () => {
  it("includes cwd and git info for all types", () => {
    const prompt = buildSystemPrompt("general-purpose", "/workspace", env);
    expect(prompt).toContain("/workspace");
    expect(prompt).toContain("Branch: main");
    expect(prompt).toContain("darwin");
  });

  it("handles non-git repos", () => {
    const prompt = buildSystemPrompt("Explore", "/workspace", envNoGit);
    expect(prompt).toContain("Not a git repository");
    expect(prompt).not.toContain("Branch:");
  });

  it("Explore prompt is read-only", () => {
    const prompt = buildSystemPrompt("Explore", "/workspace", env);
    expect(prompt).toContain("READ-ONLY");
    expect(prompt).toContain("file search specialist");
  });

  it("Plan prompt is read-only", () => {
    const prompt = buildSystemPrompt("Plan", "/workspace", env);
    expect(prompt).toContain("READ-ONLY");
    expect(prompt).toContain("software architect");
  });

  it("general-purpose has full access", () => {
    const prompt = buildSystemPrompt("general-purpose", "/workspace", env);
    expect(prompt).toContain("full access to read, write, edit");
    expect(prompt).not.toContain("READ-ONLY");
  });

  it("general-purpose includes git safety rules", () => {
    const prompt = buildSystemPrompt("general-purpose", "/workspace", env);
    expect(prompt).toContain("NEVER update git config");
    expect(prompt).toContain("NEVER run destructive git commands");
  });

  it("unknown/custom types get general-purpose base prompt", () => {
    const prompt = buildSystemPrompt("my-custom-agent", "/workspace", env);
    expect(prompt).toContain("/workspace");
    expect(prompt).toContain("general-purpose coding agent");
    expect(prompt).toContain("full access to read, write, edit");
  });

  it("statusline-setup prompt is minimal", () => {
    const prompt = buildSystemPrompt("statusline-setup", "/workspace", env);
    expect(prompt).toContain("configure settings");
    expect(prompt).toContain("read and edit files only");
  });

  it("claude-code-guide prompt is help-focused", () => {
    const prompt = buildSystemPrompt("claude-code-guide", "/workspace", env);
    expect(prompt).toContain("help answer questions");
    expect(prompt).toContain("read-only access");
  });
});
