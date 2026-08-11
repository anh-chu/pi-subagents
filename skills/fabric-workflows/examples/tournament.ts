// Pattern: tournament.
// Pairwise comparison beats absolute scoring. TypeScript runs the bounded
// bracket and byes; an agent judges exactly one pair per match.
// fabric_exec program body.

type Entrant = { id: string; text: string };

// 1. Bounded entrants with stable IDs (adapt: candidate designs, drafts, fixes).
const entrants: Entrant[] = [
  { id: "a", text: "Design A ..." },
  { id: "b", text: "Design B ..." },
  { id: "c", text: "Design C ..." },
  { id: "d", text: "Design D ..." },
].slice(0, 8);
if (entrants.length < 2) return { winner: entrants[0]?.id ?? null, matches: [] };

const matches: { round: number; a: string; b: string; winner: string; ok: boolean; reason?: string }[] = [];
let pool = [...entrants];
let round = 0;

// 2. Code owns the bracket, byes, and advancement on failed matches.
while (pool.length > 1 && round < 4) {
  round += 1;
  const next: Entrant[] = [];
  if (pool.length % 2 === 1) next.push(pool.pop()!); // bye advances deterministically
  const pairs: [Entrant, Entrant][] = [];
  for (let i = 0; i < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);

  const winners = await Promise.all(pairs.map(async ([a, b], i) => {
    try {
      const r = await agents.run({
        name: `match:r${round}:${i}:${a.id}-vs-${b.id}`,
        task: `Compare exactly these two candidates against the rubric: correctness, simplicity, maintainability. Pick one winner.\nA(${a.id}): ${a.text}\nB(${b.id}): ${b.text}`,
        tools: [],
        schema: { type: "object", properties: { winner: { enum: [a.id, b.id] }, reason: { type: "string" } }, required: ["winner", "reason"] },
      });
      const w = (r.value as any)?.winner === b.id ? b : a;
      matches.push({ round, a: a.id, b: b.id, winner: w.id, ok: true, reason: (r.value as any)?.reason });
      return w;
    } catch (e) {
      // Failed match is ledgered; first entrant advances deterministically.
      matches.push({ round, a: a.id, b: b.id, winner: a.id, ok: false, reason: String(e) });
      return a;
    }
  }));
  pool = [...next, ...winners];
}

return { winner: pool[0].id, rounds: round, matches, failedMatches: matches.filter((m) => !m.ok).length };
