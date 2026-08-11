// Pattern: classify and act.
// Heterogeneous items need different handling; classification must finish
// before any routed action starts.
// fabric_exec program body. Adapt classes, routing, and tasks.

type Ledger = { id: string; phase: "classify" | "act"; ok: boolean; detail?: string };
const ledger: Ledger[] = [];

// 1. Enumerate and bound in code.
const raw = (await pi.find({ pattern: "*.md", path: "docs", limit: 30 })).split("\n").filter(Boolean);
const items = raw.slice(0, 12).map((path, i) => ({ id: `doc-${i}-${path}`, path }));
if (items.length === 0) return { items: 0, ledger };

// 2. Phase 1: classify every item. No action starts yet.
const classified = await Promise.all(items.map(async (item, i) => {
  try {
    const r = await agents.run({
      name: `classify:${i}:${item.id}`,
      task: `Read ${item.path}. Classify it as exactly one of: outdated, current, stub.`,
      tools: ["read"],
      schema: { type: "object", properties: { class: { enum: ["outdated", "current", "stub"] }, reason: { type: "string" } }, required: ["class", "reason"] },
    });
    ledger.push({ id: item.id, phase: "classify", ok: true });
    return { ...item, klass: (r.value as any)?.class ?? null };
  } catch (e) {
    ledger.push({ id: item.id, phase: "classify", ok: false, detail: String(e) });
    return { ...item, klass: null }; // preserved, not dropped
  }
}));

// 3. Phase 2: route by class. Unclassified items are reported, never acted on.
const actions: Record<string, (p: string) => string> = {
  outdated: (p) => `List the stale claims in ${p} with line numbers. Do not edit.`,
  stub: (p) => `Propose an outline to complete the stub ${p}. Do not edit.`,
};
const acted = await Promise.all(classified.filter((c) => c.klass && actions[c.klass]).map(async (c, i) => {
  try {
    const r = await agents.run({ name: `act:${i}:${c.id}`, task: actions[c.klass!](c.path), tools: ["read", "grep"] });
    ledger.push({ id: c.id, phase: "act", ok: true });
    return { id: c.id, klass: c.klass, report: r.text };
  } catch (e) {
    ledger.push({ id: c.id, phase: "act", ok: false, detail: String(e) });
    return { id: c.id, klass: c.klass, report: null };
  }
}));

return {
  items: items.length,
  classes: Object.fromEntries(classified.map((c) => [c.id, c.klass])),
  unclassified: classified.filter((c) => !c.klass).map((c) => c.id),
  actions: acted,
  ledger,
};
