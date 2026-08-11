// Pattern: loop until done.
// Work cardinality unknown: keep sweeping until rounds come back dry.
// Code owns dedup keys, dry counting, and the round cap.
// fabric_exec program body.

const MAX_ROUNDS = 5;
const DRY_ROUNDS_TO_STOP = 2; // only successful empty rounds count as dry

const found = new Map<string, { key: string; detail: string; round: number }>();
const rounds: { round: number; ok: boolean; newItems: number; error?: string }[] = [];
let dry = 0;

for (let round = 1; round <= MAX_ROUNDS && dry < DRY_ROUNDS_TO_STOP; round++) {
  try {
    const r = await agents.run({
      name: `sweep:${round}`,
      task: `Find TODO/FIXME comments in src/ that describe unfinished behavior (not style notes). Already found (do not repeat): ${JSON.stringify([...found.keys()])}. Report each as file:line plus the comment text.`,
      tools: ["read", "grep", "find", "ls"],
      schema: {
        type: "object",
        properties: { items: { type: "array", items: { type: "object", properties: { location: { type: "string" }, comment: { type: "string" } }, required: ["location", "comment"] } } },
        required: ["items"],
      },
    });
    // Code owns identity: dedupe by stable key, count only genuinely new items.
    let fresh = 0;
    for (const item of ((r.value as any)?.items ?? []) as { location: string; comment: string }[]) {
      const key = item.location.trim();
      if (found.has(key)) continue;
      found.set(key, { key, detail: item.comment, round });
      fresh += 1;
    }
    rounds.push({ round, ok: true, newItems: fresh });
    dry = fresh === 0 ? dry + 1 : 0; // successful empty round counts toward dry
  } catch (e) {
    // Failed round is retained and never counts as dry.
    rounds.push({ round, ok: false, newItems: 0, error: String(e) });
  }
}

return {
  items: [...found.values()],
  rounds,
  stoppedBecause: dry >= DRY_ROUNDS_TO_STOP ? "dry" : "round cap",
  failedRounds: rounds.filter((r) => !r.ok).length,
};
