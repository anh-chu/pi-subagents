// Pattern: fan out and synthesize.
// Independent per-item work whose results need one whole-set judgment.
// fabric_exec program body. Adapt items, tasks, and schema to the real request.

type Item = { id: string; path: string };

// 1. Enumerate and bound in code (never in an agent).
const files = (await pi.find({ pattern: "*.ts", path: "src/routes", limit: 40 })).split("\n").filter(Boolean);
const items: Item[] = files.slice(0, 16).map((path, i) => ({ id: `route-${i}-${path}`, path }));
if (items.length === 0) return { items: 0, findings: [], ledger: [] };

// 2. Fan out. One agent per item, unique name, per-item try/catch.
const results = await Promise.all(items.map(async (item, i) => {
  try {
    const r = await agents.run({
      name: `audit:${i}:${item.id}`,
      task: `Read ${item.path} and report whether every exported route handler enforces authentication. Cite line numbers. If unsure, say unsure.`,
      tools: ["read", "grep"],
      schema: {
        type: "object",
        properties: {
          protected: { type: "boolean" },
          evidence: { type: "string" },
          confidence: { enum: ["high", "medium", "low"] },
        },
        required: ["protected", "evidence", "confidence"],
      },
    });
    return { id: item.id, ok: true as const, value: r.value ?? null, error: r.error ?? null };
  } catch (e) {
    // Preserve missing coverage: keep the ID with a null result.
    return { id: item.id, ok: false as const, value: null, error: String(e) };
  }
}));

// 3. Synthesize over the FULL ledger, including failures, so the synthesis
//    agent can distinguish "checked and safe" from "not checked".
const synthesis = await agents.run({
  name: "synthesize:auth-audit",
  task: `Synthesize this route-auth audit. Some items failed and were not checked; list them separately, never as safe.\n${JSON.stringify(results)}`,
  tools: [],
});

return {
  items: items.length,
  failed: results.filter((r) => !r.ok).map((r) => r.id),
  findings: results.filter((r) => r.ok),
  summary: synthesis.text,
};
