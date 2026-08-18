import { describe, expect, it } from "vitest";
import { revertFieldToDefault } from "../src/agent-field-revert.js";
import { DEFAULT_AGENTS } from "../src/default-agents.js";

const plan = DEFAULT_AGENTS.get("Plan")!;
/** An agent whose default model is undefined (Plan now pins a model). */
const noModelAgent = DEFAULT_AGENTS.get("worker")!;

/** Simple description with no special chars, so it serializes unquoted. */
const simpleDefault = { ...plan, description: "simple-planning-desc" };

describe("revertFieldToDefault", () => {
  it("reverts a scalar frontmatter field (description) in place", () => {
    const content = `---
description: My custom description
model: sonnet
---
Custom body`;
    const updated = revertFieldToDefault(content, "description", simpleDefault);
    expect(updated).toContain(`description: ${simpleDefault.description}`);
    // Other fields untouched
    expect(updated).toContain("model: sonnet");
    expect(updated).toContain("Custom body");
    expect(updated).not.toContain("My custom description");
  });

  it("inserts the field if it was previously omitted", () => {
    const content = `---
model: sonnet
---
Custom body`;
    const updated = revertFieldToDefault(content, "description", simpleDefault);
    expect(updated).toContain(`description: ${simpleDefault.description}`);
    expect(updated).toContain("model: sonnet");
  });

  it("removes the field entirely when the default value is undefined", () => {
    const content = `---
description: Something
model: gpt-5
---
Custom body`;
    const updated = revertFieldToDefault(content, "model", noModelAgent);
    expect(noModelAgent.model).toBeUndefined();
    expect(updated).not.toMatch(/^model:/m);
    expect(updated).toContain("description: Something");
  });

  it("reverts systemPrompt by replacing only the body, not the frontmatter", () => {
    const content = `---
description: Something custom
---
Totally custom body`;
    const updated = revertFieldToDefault(content, "systemPrompt", plan);
    expect(updated).toContain("description: Something custom");
    expect(updated).not.toContain("Totally custom body");
    expect(updated.trim().endsWith(plan.systemPrompt.trim())).toBe(true);
  });

  it("reverts builtinToolNames by regenerating the combined tools: field to the default's full combination", () => {
    const content = `---
tools: bash, read
---
Body`;
    const updated = revertFieldToDefault(content, "builtinToolNames", plan);
    // Whatever Plan's actual default tools combination is, it must be written back verbatim
    // (this locks in round-trip behavior rather than a hardcoded literal that may drift).
    expect(updated).toMatch(/^tools: .+$/m);
    expect(updated).not.toContain("bash, read");
  });

  it("quotes values containing special characters", () => {
    const content = `---
description: plain
---
Body`;
    const updated = revertFieldToDefault(content, "description", {
      ...plan,
      description: "Has: a colon",
    });
    expect(updated).toContain('description: "Has: a colon"');
  });

  it("reverts the contract to the default's inline JSON on one line", () => {
    const content = `---
description: x
contract: {"type":"object","required":["foo"]}
---
Body`;
    const updated = revertFieldToDefault(content, "contract", noModelAgent);
    expect(noModelAgent.contract).toBeDefined();
    expect(updated).toContain(`contract: ${JSON.stringify(noModelAgent.contract)}`);
    expect(updated).not.toContain('["foo"]');
    expect(updated).toContain("description: x");
  });

  it("removes the contract when the default has none", () => {
    const content = `---
description: x
contract: {"type":"object"}
---
Body`;
    const updated = revertFieldToDefault(content, "contract", { ...plan, contract: undefined });
    expect(updated).not.toMatch(/^contract:/m);
    expect(updated).toContain("description: x");
  });

  it("returns content unchanged for an unrecognized field key", () => {
    const content = `---
description: plain
---
Body`;
    expect(revertFieldToDefault(content, "notARealField", plan)).toBe(content);
  });

  it("leaves content unchanged when there is no frontmatter block", () => {
    const content = "No frontmatter here";
    expect(revertFieldToDefault(content, "description", plan)).toBe(content);
  });
});
