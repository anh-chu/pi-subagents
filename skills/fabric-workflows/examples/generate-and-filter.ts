// Pattern: generate and filter.
// Exploration should diverge first, then one rubric judges. Generation
// finishes, code deduplicates and bounds, then filter agents score.
// fabric_exec program body.

const PERSPECTIVES = ["performance", "reliability", "developer experience", "security"];

// 1. Divergent generation: one generator per perspective.
const generated = await Promise.all(PERSPECTIVES.map(async (angle, i) => {
  try {
    const r = await agents.run({
      name: `generate:${i}:${angle}`,
      task: `From a ${angle} perspective, propose up to 5 concrete improvements to this repo's subagent dispatch path (src/agent-runner.ts). One line each.`,
      tools: ["read", "grep"],
      schema: { type: "object", properties: { ideas: { type: "array", items: { type: "string" }, maxItems: 5 } }, required: ["ideas"] },
    });
    return { angle, ok: true as const, ideas: ((r.value as any)?.ideas ?? []) as string[] };
  } catch (e) {
    return { angle, ok: false as const, ideas: [], error: String(e) };
  }
}));

// 2. Code owns dedup and bounds: normalize key, drop duplicates, cap candidates.
const seen = new Set<string>();
const candidates = generated
  .flatMap((g, gi) => g.ideas.map((idea, ii) => ({ id: `idea-${gi}-${ii}`, angle: g.angle, idea })))
  .filter((c) => {
    const key = c.idea.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0, 12);

// 3. One rubric, applied by filter agents after generation fully completed.
const scored = await Promise.all(candidates.map(async (c, i) => {
  try {
    const r = await agents.run({
      name: `filter:${i}:${c.id}`,
      task: `Score this proposal 1-5 on the rubric: impact on correctness, implementation cost, blast radius. Proposal: ${c.idea}`,
      tools: ["read"],
      schema: { type: "object", properties: { score: { type: "number" }, rationale: { type: "string" } }, required: ["score", "rationale"] },
    });
    return { ...c, ok: true as const, score: (r.value as any)?.score ?? 0, rationale: (r.value as any)?.rationale };
  } catch (e) {
    return { ...c, ok: false as const, score: null, error: String(e) };
  }
}));

return {
  generatorFailures: generated.filter((g) => !g.ok).map((g) => g.angle),
  unscored: scored.filter((s) => !s.ok).map((s) => s.id),
  ranked: scored.filter((s) => s.ok).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
};
