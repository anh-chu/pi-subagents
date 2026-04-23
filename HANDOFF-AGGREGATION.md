# Handoff: multi-fork aggregation continuation

## 1) Objective

Continue original request:

- Aggregate improvements from 4 fork branches into `fork-aggregate`
  - `elidickinson/main`
  - `mikeyobrien/fix-isolate`
  - `yzlin/master`
  - `Evizero/custom`
- Keep branch stable and test-green.
- Prefer surgical/manual ports over raw high-conflict cherry-picks.

---

## 2) Current branch state

- Repo: `/home/sil/pi-extensions/pi-subagents`
- Branch: `fork-aggregate`
- Head commit: `1423395`
- Working tree: clean
- Test status: `22 files, 274 tests` passed (`npm test`)

Recent top commits:

- `1423395` README fork-source clarity
- `4942c40` prepare script tolerant when husky unavailable
- `3878855` package rename to `@anh-chu/pi-subagents`
- `d79d3d7` stop/cancel hardening subset + result preview rendering
- `be29b81` ephemeral child session guard
- `70cb46d` + `e0ef77e` send_message compatibility alias + stale-message suppression

---

## 3) What is already integrated

### mikeyobrien

- Isolate leak fix integrated (`28f29a5` behavior): prevents AGENTS/APPEND leakage.

### yzlin

- Parent bridge baseline integrated (content-based sync from `b9cc2da` lineage).
- Bridge runtime/tests present.

### elidickinson (integrated fully or adapted)

Integrated/adapted features include:

- activity key collision fix semantics
- model resolver crash guard
- undefined `subagent_type` crash guard
- defensive bash message handling
- tool call display compatibility
- foreground abort propagation
- resource leak hardening
- cleanup timeout setting
- queued wait support for `get_subagent_result(wait=true)`
- sequential numeric IDs
- `send_message` compatibility alias integrated on parent-bridge path
- stale post-consumption notification/message suppression semantics

### Evizero (targeted partial ports)

- ignore ephemeral child session lifecycle/UI events
- stop/cancel hardening subset (not full architecture rewire)
- result preview rendering improvements + renderer tests

---

## 4) Important constraints for next agent

1. Preserve parent-bridge model:
   - `message_parent`, `ask_parent`, `reply_to_subagent`, `get_subagent_message`
   - per-session scoping and queue behavior
2. Avoid raw cherry-pick of high-conflict commits touching large `src/index.ts` session flow without manual scoping.
3. Keep install compatibility:
   - `prepare` script currently safe for omit-dev installs.
4. Keep lockfile hooks happy:
   - if `package.json` changes, update both `package-lock.json` and `bun.lock`.

---

## 5) Remaining work worth doing (priority)

## Task A (high value): Evizero tool-selection hardening (partial)

Source commit reference:
- `153595b` (Evizero/custom)

Goal:
- Port only robust tool selection/validation guards.
- Do not import broad runtime rewires.

Suggested files likely impacted:
- `src/agent-runner.ts`
- `src/agent-types.ts`
- `src/index.ts` (only if needed for call-site guards)

Acceptance:
- No regression in bridge tool availability.
- Add/adjust tests for invalid/edge tool wiring.
- `npm test` fully green.

---

## Task B (high value): Evizero background result visibility improvements (partial)

Source commit reference:
- `18f1ddc`

Goal:
- Improve user-facing visibility for background outcomes.
- Keep existing notification pipeline + group-join behavior.

Likely files:
- `src/index.ts` (notification rendering path)
- `src/ui/*` renderer helper files
- tests under `test/index*.test.ts`, `test/agent-widget.test.ts`

Acceptance:
- Clearer completion previews/status without duplicate nudges.
- Group and individual completion behavior unchanged functionally.
- Tests green.

---

## Task C (medium-high): Evizero append-mode prompt/runtime alignment (targeted)

Source commit reference:
- `5e690bb`

Goal:
- Align append-mode prompt assembly/runtime behavior.
- Must not reintroduce AGENTS/APPEND leakage.

Likely files:
- `src/prompts.ts`
- `src/agent-runner.ts`
- related prompt tests

Acceptance:
- Append/replace behaviors deterministic.
- isolation semantics preserved.
- Add focused tests for append mode + bridge tool presence.

---

## 6) Explicitly deferred (low ROI or very high conflict)

- Full Evizero runtime/session architecture waves:
  - `cc07d3a`, `431f6df`, `80e29f4` (large rewire scope)
- Docs/TODO/report-only commits
- CI-only updates from fork comparison scope

---

## 7) Commands and workflow to use

Baseline before each wave:

```bash
git checkout fork-aggregate
git pull
npm test
```

Inspect source commits:

```bash
git show <commit>
git show --name-only <commit>
```

After edits:

```bash
npm test
git add <files>
git commit -m "<message>"
git push
```

If `package.json` changed:

```bash
npm install --package-lock-only
bun install --lockfile-only
git add package-lock.json bun.lock
```

---

## 8) Known gotchas observed in this branch

- Pre-commit hook enforces lockfile sync (`package.json` vs lockfiles).
- `git cherry` counts will still show many “missing” commits because many were integrated by manual port, not commit-identical cherry-pick.
- Avoid merging full Evizero `f4ae45c` patch directly. Keep only ephemeral-session guard already ported.

---

## 9) Publish readiness snapshot

Current package identity:
- `@anh-chu/pi-subagents`

Install blocker fixed:
- `prepare` script now no-ops if husky absent (`omit=dev` install safe).

Before release tag/publish:
- bump version in `package.json`
- run `npm test` + `npm run prepublishOnly`

---

## 10) Minimal next execution plan

1. Execute Task A (tool-selection hardening partial)
2. Execute Task B (background visibility partial)
3. Re-assess Task C risk, then execute targeted subset
4. Full regression test
5. Update README aggregation ledger with backlinks for newly ported commits
6. Hand back for release/publish
