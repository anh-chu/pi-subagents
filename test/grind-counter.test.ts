import { describe, expect, it } from "vitest";
import { formatGrindStatus, GrindCounter } from "../src/grind-counter.js";

function observe(counter: GrindCounter, index: number, toolName: string) {
  const id = `call-${index}`;
  counter.observeToolStart(id, toolName);
  return counter.consumeNudge(id);
}

describe("GrindCounter", () => {
  it("nudges once at the default general threshold (25) and not before", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 24; i++) {
      expect(observe(counter, i, "read")).toBeUndefined();
    }
    const nudge = observe(counter, 25, "read");
    expect(nudge?.kind).toBe("inline");
    expect(nudge?.inlineStreak).toBe(25);
    expect(nudge?.message).toContain("25 consecutive inline calls");
  });

  it("suppresses repeats during the default cooldown and allows a fresh nudge at 50", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 25; i++) {
      observe(counter, i, "read");
    }
    for (let i = 26; i <= 49; i++) {
      expect(observe(counter, i, "read")).toBeUndefined();
    }
    const nudge = observe(counter, 50, "read");
    expect(nudge?.kind).toBe("inline");
    expect(nudge?.message).toContain("50 consecutive inline calls");
  });

  it("resets counters and cooldown on Agent at raw call 10", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 9; i++) {
      expect(observe(counter, i, "read")).toBeUndefined();
    }
    counter.observeToolStart("call-10", "Agent");
    for (let i = 11; i <= 15; i++) {
      expect(observe(counter, i, "read")).toBeUndefined();
    }
    const snap = counter.snapshot();
    expect(snap.inlineStreak).toBe(5);
    expect(snap.bashStreak).toBe(0);
  });

  it("lets a new streak nudge at its own threshold after Agent clears cooldown", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 25; i++) {
      if (observe(counter, i, "read")) {
        // consume the nudge at 25
      }
    }
    counter.observeToolStart("agent", "Agent");
    for (let i = 1; i <= 24; i++) {
      expect(observe(counter, i, "read")).toBeUndefined();
    }
    const nudge = observe(counter, 25, "read");
    expect(nudge?.kind).toBe("inline");
    expect(nudge?.inlineStreak).toBe(25);
  });

  it("nudges at 8 consecutive bash calls with the targeted message", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 7; i++) {
      expect(observe(counter, i, "bash")).toBeUndefined();
    }
    const nudge = observe(counter, 8, "bash");
    expect(nudge?.kind).toBe("bash");
    expect(nudge?.bashStreak).toBe(8);
    expect(nudge?.message).toContain("8 consecutive bash calls");
    expect(nudge?.message).toContain("reproduction");
  });

  it("breaks bash consecutiveness with a counted non-bash call", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 7; i++) {
      observe(counter, i, "bash");
    }
    observe(counter, 8, "read");
    expect(observe(counter, 9, "bash")).toBeUndefined();
    const snap = counter.snapshot();
    expect(snap.bashStreak).toBe(1);
    expect(snap.inlineStreak).toBe(9);
  });

  it("treats get_subagent_result and steer_subagent as neutral coordination", () => {
    const counter = new GrindCounter();
    for (let i = 1; i <= 7; i++) {
      observe(counter, i, "bash");
    }
    const before = counter.snapshot();
    counter.observeToolStart("neutral-1", "get_subagent_result");
    const afterNeutral = counter.snapshot();
    expect(afterNeutral.inlineStreak).toBe(before.inlineStreak);
    expect(afterNeutral.bashStreak).toBe(0);

    counter.observeToolStart("neutral-2", "steer_subagent");
    expect(counter.snapshot().inlineStreak).toBe(before.inlineStreak);
  });

  it("counts unknown custom tools by default", () => {
    const counter = new GrindCounter({ inlineThreshold: 2 });
    expect(observe(counter, 1, "update_plan")).toBeUndefined();
    const nudge = observe(counter, 2, "task_tracker");
    expect(nudge?.kind).toBe("inline");
    expect(nudge?.inlineStreak).toBe(2);
  });

  it("gives bash priority when both thresholds match", () => {
    const counter = new GrindCounter({
      inlineThreshold: 3,
      bashThreshold: 3,
      cooldownCalls: 1,
    });
    observe(counter, 1, "bash");
    observe(counter, 2, "bash");
    const nudge = observe(counter, 3, "bash");
    expect(nudge?.kind).toBe("bash");
  });

  it("applies the shared cooldown to general nudges after a bash nudge", () => {
    const counter = new GrindCounter({
      inlineThreshold: 5,
      bashThreshold: 2,
      cooldownCalls: 5,
    });
    const first = observe(counter, 1, "bash");
    expect(first).toBeUndefined();
    const bashNudge = observe(counter, 2, "bash");
    expect(bashNudge?.kind).toBe("bash");

    for (let i = 3; i <= 6; i++) {
      expect(observe(counter, i, "read")).toBeUndefined();
    }
    const general = observe(counter, 7, "read");
    expect(general?.kind).toBe("inline");
    expect(general?.inlineStreak).toBe(7);
  });

  it("cancels a pending nudge when a later Agent start arrives", () => {
    const counter = new GrindCounter({ inlineThreshold: 1 });
    counter.observeToolStart("inline-id", "read");
    counter.observeToolStart("agent-id", "Agent");
    expect(counter.consumeNudge("inline-id")).toBeUndefined();
    const snap = counter.snapshot();
    expect(snap.inlineStreak).toBe(0);
    expect(snap.bashStreak).toBe(0);
    expect(snap.pendingNudges).toBe(0);
    expect(snap.cooldownRemaining).toBe(0);
  });

  it("consumes a pending nudge exactly once", () => {
    const counter = new GrindCounter({ inlineThreshold: 1 });
    counter.observeToolStart("nudge", "read");
    const nudge = counter.consumeNudge("nudge");
    expect(nudge).toBeDefined();
    expect(counter.consumeNudge("nudge")).toBeUndefined();
  });

  it("classifies tool names case-insensitively", () => {
    const counter = new GrindCounter({ bashThreshold: 2, inlineThreshold: 10 });
    counter.observeToolStart("a", "BASH");
    counter.observeToolStart("b", "BASH");
    const bashNudge = counter.consumeNudge("b");
    expect(bashNudge?.kind).toBe("bash");

    counter.observeToolStart("c", "agent");
    expect(counter.snapshot().bashStreak).toBe(0);

    counter.observeToolStart("d", "GET_SUBAGENT_RESULT");
    expect(counter.snapshot().inlineStreak).toBe(0);
  });
});

describe("formatGrindStatus", () => {
  it("shows streaks, thresholds, and cooldown state", () => {
    const counter = new GrindCounter({
      inlineThreshold: 5,
      bashThreshold: 2,
      cooldownCalls: 3,
    });

    const fresh = formatGrindStatus(counter.snapshot());
    expect(fresh).toContain("inline 0/5");
    expect(fresh).toContain("bash 0/2");
    expect(fresh).toContain("nudge cooldown ready");

    for (let i = 1; i <= 5; i++) {
      observe(counter, i, "read");
    }
    for (let i = 1; i <= 2; i++) {
      observe(counter, 100 + i, "read");
    }
    const active = formatGrindStatus(counter.snapshot());
    expect(active).toContain("inline 7/5");
    expect(active).toContain("nudge cooldown 1 counted calls remaining");

    counter.observeToolStart("reset", "Agent");
    for (let i = 1; i <= 3; i++) {
      observe(counter, 200 + i, "read");
    }
    const ready = formatGrindStatus(counter.snapshot());
    expect(ready).toContain("inline 3/5");
    expect(ready).toContain("nudge cooldown ready");
  });
});
