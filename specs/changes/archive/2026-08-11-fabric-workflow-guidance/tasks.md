# Tasks: fabric workflow guidance

1. [x] Read pi-fabric fabric-exec skill (`/home/sil/.pi/agent/npm/node_modules/pi-fabric/skills/fabric-exec/SKILL.md` + `references/agents.md`) and record the exact agents/workflow API contract used by examples.
2. [x] Write `skills/fabric-workflows/SKILL.md` (frontmatter, prerequisite note, pattern table, invariants, division-of-labor rule) and `references/pattern-selection.md`.
3. [x] Write the six example programs in `skills/fabric-workflows/examples/` against the verified API.
4. [x] Add `"skills": ["./skills"]` to package.json `pi` field.
5. [x] Edit injection strings at `src/index.ts:837` (append skill pointer sentence) and `:865` (compact one-liner with skill pointer).
6. [x] Run existing test suite and typecheck.
7. [x] Live execution blocked (agents disabled in this session's Fabric config); contract verified against pi-fabric fabric-exec skill references/agents.md (agents.run signature, result.value via schema, Promise.all fan-out).
8. [x] Verified in isolated pi session (temp dir, --no-extensions --no-skills, explicit -e/--skill flags): injection sentence present in Agent tool description; skill listed in available_skills with full description.
9. [x] Behavioral probe run in isolated session with pi-fabric + skill loaded: model produced full-coverage ledger, used division-of-labor reasoning, and correctly applied the skill's "direct work needs no orchestration" rule on a trivial fixture (fan-out would be waste). Probe on a real multi-route repo deferred to normal use.
10. [x] Self-review pass: diff minimal, gating preserved, tsconfig excludes skills/, R1-R4 traced. Pre-existing lint error in src/agent-mode.ts noted, out of scope.
11. [x] Archived.
