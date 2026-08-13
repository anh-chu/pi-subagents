import { describe, expect, it } from "vitest";
import { normalizeForReplay } from "../src/context.js";

describe("normalizeForReplay (context: fork message seeding)", () => {
  it("passes through plain user/assistant/toolResult messages unchanged", () => {
    const user = { role: "user", content: "hi" };
    const assistant = { role: "assistant", content: [{ type: "text", text: "yo" }] };
    const toolResult = { role: "toolResult", toolCallId: "c1", toolName: "bash", content: [] };
    expect(normalizeForReplay(user)).toBe(user);
    expect(normalizeForReplay(assistant)).toBe(assistant);
    expect(normalizeForReplay(toolResult)).toBe(toolResult);
  });

  it("converts a compactionSummary into a user message preserving the summary", () => {
    const out = normalizeForReplay({
      role: "compactionSummary",
      summary: "earlier work summarized",
      tokensBefore: 999,
    }) as { role: string; content: string };
    expect(out.role).toBe("user");
    expect(out.content).toContain("earlier work summarized");
    expect(out.content).toContain("compacted");
  });

  it("converts a branchSummary into a user message preserving the summary", () => {
    const out = normalizeForReplay({
      role: "branchSummary",
      summary: "branch summary text",
      fromId: "x",
    }) as { role: string; content: string };
    expect(out.role).toBe("user");
    expect(out.content).toContain("branch summary text");
  });

  it("drops a summary message with no usable summary text", () => {
    expect(normalizeForReplay({ role: "compactionSummary", summary: "" })).toBeUndefined();
    expect(normalizeForReplay({ role: "compactionSummary" })).toBeUndefined();
  });

  it("drops unknown message shapes rather than replaying them", () => {
    expect(normalizeForReplay({ role: "model_change", provider: "x" })).toBeUndefined();
    expect(normalizeForReplay({})).toBeUndefined();
  });
});
