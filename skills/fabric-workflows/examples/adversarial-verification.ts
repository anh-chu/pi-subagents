// Pattern: adversarial verification.
// Claims need skeptical checks by an agent that did not produce them.
// Production finishes before any skeptic starts. Ledger both failure kinds.
// fabric_exec program body.

// 1. Producers: bounded fan-out over areas, each returns claims with IDs.
const areas = ["src/agent-runner.ts", "src/agent-manager.ts"].slice(0, 8);
const produced = await Promise.all(areas.map(async (area, i) => {
  try {
    const r = await agents.run({
      name: `produce:${i}:${area}`,
      task: `Read ${area}. List concrete concurrency or lifecycle defects as claims. Each claim: file, line, one-sentence defect.`,
      tools: ["read", "grep"],
      schema: {
        type: "object",
        properties: { claims: { type: "array", items: { type: "object", properties: { file: { type: "string" }, line: { type: "number" }, defect: { type: "string" } }, required: ["file", "line", "defect"] } } },
        required: ["claims"],
      },
    });
    return { area, ok: true as const, claims: ((r.value as any)?.claims ?? []) as any[] };
  } catch (e) {
    return { area, ok: false as const, claims: [], error: String(e) };
  }
}));

// 2. Code assigns claim IDs and bounds the skeptic pass.
const claims = produced.flatMap((p, pi_) => p.claims.map((c, ci) => ({ id: `claim-${pi_}-${ci}`, ...c }))).slice(0, 20);

// 3. Skeptics start only after production completed. Fresh agent per claim.
const verdicts = await Promise.all(claims.map(async (claim, i) => {
  try {
    const r = await agents.run({
      name: `skeptic:${i}:${claim.id}`,
      task: `Skeptically verify this defect claim. Read the cited code yourself; try to refute it. Claim: ${JSON.stringify(claim)}`,
      tools: ["read", "grep"],
      schema: { type: "object", properties: { verdict: { enum: ["confirmed", "refuted", "unclear"] }, reason: { type: "string" } }, required: ["verdict", "reason"] },
    });
    return { id: claim.id, ok: true as const, verdict: (r.value as any)?.verdict ?? "unclear", reason: (r.value as any)?.reason };
  } catch (e) {
    return { id: claim.id, ok: false as const, verdict: "unverified", reason: String(e) };
  }
}));

return {
  producerFailures: produced.filter((p) => !p.ok).map((p) => p.area),
  claims,
  verdicts,
  confirmed: verdicts.filter((v) => v.verdict === "confirmed").map((v) => v.id),
  unverified: verdicts.filter((v) => !v.ok).map((v) => v.id),
};
