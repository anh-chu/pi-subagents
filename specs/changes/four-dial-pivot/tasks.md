# Tasks: Four-Dial Pivot

Ordered, checkable tasks for implementing the four-dial pivot. Each task includes success criteria and relevant test coverage.

## Phase 1: Schema and Dispatch (Optional subagent_type)

### Task 1.1: Make subagent_type optional in Agent tool schema

**Description:** Update the Agent tool parameter definition in src/index.ts to make `subagent_type` optional instead of required.

**Changes:**
- Find the TypeBox schema definition for Agent parameters (around line 871-880).
- Wrap `subagent_type` with Type.Optional() to make it optional.
- Ensure the string description still lists all known agent types (built-in + dynamic custom).

**Success Criteria:**
- Tool accepts Agent calls without subagent_type.
- Tool falls back to general-purpose when type is omitted or unknown (current behavior).
- Existing calls with explicit subagent_type work unchanged.

**Testing:**
- New test in test/agent-guards.test.ts: "Agent with missing subagent_type resolves to general-purpose".
- Existing tests pass (no regression).

**Acceptance:** npm test passes; typescript compiles.

---

### Task 1.2: Dispatch already handles unknown subagent_type correctly

**Description:** Verify src/index.ts dispatch logic (around line 1041-1048) already falls back to general-purpose for unknown or omitted subagent_type. No code changes needed; task is validation only.

**Current Behavior (verified against source):**
- Dispatch checks availability status via getAgentAvailability(rawType).
- If status === "unknown", falls back to "general-purpose" with current behavior preserved.
- If status === "disabled", returns an error message.

**Success Criteria:**
- Unknown type falls back to general-purpose (no change needed).
- Dispatch without subagent_type (undefined) is handled the same as with type:"general-purpose" (both trigger unknown status → fallback).
- Dispatch with subagent_type:"Explore" still restricts to read-only tools (no regression).

**Testing:**
- Update test/agent-guards.test.ts: "Agent without type defaults to general-purpose with all tools" (covers both undefined and unknown scenarios).
- Add integration test: spawn two agents, one with explicit type:general-purpose, one without; both receive same tool set.

**Acceptance:** Tests pass; no regressions.

---

## Phase 2: Built-in Prompts (<15 Lines, except Orchestrator)

### Task 2.1: Condense general-purpose system prompt

**Description:** Reduce general-purpose prompt in src/default-agents.ts to <15 lines: capability + output contract only.

**Current:** `systemPrompt: ""` (empty).
**New:** <15 lines describing the agent's role and expected output format (if any).

**Changes:**
- Edit src/default-agents.ts, general-purpose config.
- Rewrite systemPrompt to: "General-purpose LLM agent. Handles complex multi-step tasks. Output as text responses with code blocks and structured data where needed."

**Success Criteria:**
- Prompt is <15 lines.
- No mention of task methodology, routing heuristics, or multi-step walkthrough.
- Dispatch and output still correct.

**Testing:**
- Snapshot test in test/default-agents.test.ts: verify prompt line count and absence of methodology keywords.

**Acceptance:** Snapshot passes; agent output unchanged.

---

### Task 2.2: Condense Explore system prompt

**Description:** Reduce Explore prompt in src/default-agents.ts to <15 lines.

**Current:** ~80 lines covering read-only mode, tool usage, scope discipline, output format.
**New:** ~12 lines with capability (read-only search specialist) + output contract (absolute paths, citations).

**Changes:**
- Edit src/default-agents.ts, Explore config, systemPrompt field.
- Rewrite to:
```
# Explore: Targeted Codebase Search
Read-only file and content search specialist. Uses find, grep, read for methodical codebase navigation.
Does NOT create, modify, or delete files.

Capabilities: Pattern-based file search, content grep, file reading.
Output: Absolute file paths with line:col citations. Quote minimal snippets to support claims.
```

**Success Criteria:**
- Prompt is <15 lines.
- No read-only prohibition manifesto, no scope discipline section, no methodology.
- Tool restrictions (builtinToolNames = READ_ONLY_TOOLS) remain in place (enforced separately).

**Testing:**
- Snapshot test in test/default-agents.test.ts for line count.
- Functional test: Explore agent still refuses to write files (tool restrictions, not prompt).

**Acceptance:** Snapshot passes; Explore dispatch uses tools correctly.

---

### Task 2.3: Condense Plan system prompt

**Description:** Reduce Plan prompt to <15 lines.

**Current:** ~140 lines covering planning precondition, process, tool usage, output format, parallelization.
**New:** ~12 lines with capability (architecture specialist) + output contract (design, file citations, parallel dispatch suggestion).

**Changes:**
- Edit src/default-agents.ts, Plan config, systemPrompt.
- Rewrite to:
```
# Plan: Multi-Step Implementation Strategy
Software architect and planning specialist. Designs implementation strategies based on Explore findings.
Read-only mode (no file edits).

Output: Implementation design with file references, identified dependencies, parallel work opportunities if applicable.
```

**Success Criteria:**
- <15 lines.
- No multi-step planning walkthrough, no routing tables, no "requirements" section.
- Tool restrictions preserved.

**Testing:**
- Snapshot test.
- Functional test (if integration test exists for Plan dispatch).

**Acceptance:** Snapshot passes.

---

### Task 2.4: Condense worker system prompt

**Description:** Reduce worker prompt to <15 lines.

**Current:** ~180 lines covering execution contract, validation, decision handling, turn efficiency, recovery.
**New:** ~12 lines with capability (implementation executor) + output contract (changes made, validation summary, open risks).

**Changes:**
- Edit src/default-agents.ts, worker config.
- Rewrite to:
```
# Worker: Implementation Executor
Executes approved directions with minimal, correct changes. Validates against code patterns and runs tests.
Single writer thread; coordinates with orchestrator on decisions.

Output: Summary of changes, validation results, identified risks, recommended next steps.
```

**Success Criteria:**
- <15 lines.
- No recovery protocol, no turn efficiency walkthrough.
- Tool set (WRITE_TOOLS) unchanged.

**Testing:**
- Snapshot test.

**Acceptance:** Snapshot passes.

---

### Task 2.5: Condense reviewer, oracle; Rewrite orchestrator for active supervision

**Description:** Apply condensation to reviewer and oracle (remaining <15-line agents). Rewrite orchestrator as the single exception: ~30-40 lines, focused on active supervision methodology.

**For reviewer and oracle:**
1. Identify capability posture + output contract.
2. Rewrite to <15 lines in src/default-agents.ts.
3. Preserve tool allowlists, model defaults, lockModel flags.

**For orchestrator (exception):**
1. Rewrite to ~30-40 lines (no longer <15-line rule).
2. Focus on active supervision methodology:
   - Dispatch agents with complete briefs; set expectations.
   - Monitor background agents via get_subagent_result during execution.
   - Steer drift early using steer_subagent when issues arise.
   - Review work against expectations before accepting.
   - Iterate with follow-up agents on findings.
3. Output contract: decision summary, monitoring findings, synthesis + recommendations.
4. NO routing tables (those live in AGENTS.md).
5. Preserve tool allowlist, model defaults, lockModel flags.

**Agents and Success Criteria:**
- reviewer: <15 lines, code review specialist, summary + recommendations.
- oracle: <15 lines, decision consistency advisor, guidance on inherited state.
- orchestrator: ~30-40 lines, active supervision (dispatch, monitor, steer, review, iterate).
- All three: no methodology, routing, or heuristics outside their assigned roles.

**Testing:**
- Snapshot test in test/default-agents.test.ts covering all three agents (verify 6 agents at <15 lines, orchestrator at ~30-40).
- Verify line counts and absence of routing/methodology keywords.

**Acceptance:** Snapshots pass; orchestrator supervision methodology clearly present.

---

## Phase 3: Tool Description and Dynamic Content

### Task 3.1: Audit and remove routing tables from fullAgentToolDescription

**Description:** Review src/index.ts, fullAgentToolDescription definition (around line 759). buildGuidelinesText() (line 726-734) currently generates routing advice; it must be removed or deprecated.

**Current buildGuidelinesText() output (line 731):**
```
- Use ${name} for: ${desc.replace(/\.$/, "").toLowerCase()}
```
This provides agent-selection guidance via the description. Task: remove this function call from tool descriptions or replace with empty string.

**Changes:**
- Remove any text matching patterns: "Explore threshold", "Plan threshold", "agent selection guidelines", "pick the most specific type", routing heuristics.
- Retain: agent type catalog (name + one-line capability), schema, hard invariants (self-contained prompts, file fencing, verify results), parallel/resume/steer/schedule notes.
- In fullAgentToolDescription, replace buildGuidelinesText() call with empty string or remove the Guidelines section entirely.
- Update tool description to NOT call buildGuidelinesText() for routing; keep only for custom template interpolation (where user decides what to include).

**Files Affected:**
- src/index.ts (fullAgentToolDescription, compactAgentToolDescription, buildGuidelinesText)

**Success Criteria:**
- No routing tables or buildGuidelinesText() output in any description mode.
- Schema and invariants still present.
- Agent type list remains with capabilities.
- {{guidelines}} placeholder in custom templates renders as empty (no longer available).

**Testing:**
- Smoke test in test/agent-mode.test.ts or new test/agent-tool-description.test.ts:
  - Assert description does not contain "Explore threshold".
  - Assert description does not contain "pick the most specific type".
  - Assert description contains "agent types:" (type catalog).
  - Assert description contains "self-contained" (invariant mention).

**Acceptance:** Test passes; manual review confirms no routing heuristics remain.

---

### Task 3.2: Verify compact and custom tool description modes

**Description:** Ensure compact and custom modes also have routing tables removed. Verify no buildGuidelinesText() is called in compact description. In custom mode, {{guidelines}} placeholder should not be available (or render empty).

**Changes:**
- Verify compactAgentToolDescription (src/index.ts, around line 810) does NOT call buildGuidelinesText().
- In renderToolDescriptionTemplate (line 823-827), do NOT provide guidelines callable (or provide one that returns empty string).
- Update template vars map to exclude guidelines or set it to () => "".

**Success Criteria:**
- Compact mode: type list + essential invariants, no routing.
- Custom mode: user prose + interpolated type list, no curated routing advice.
- {{guidelines}} placeholder not available or renders empty.

**Testing:**
- Smoke test for each mode (full, compact, custom).

**Acceptance:** Tests pass.

---

### Task 3.3: Add dynamic model catalog to tool description

**Description:** Enhance tool descriptions to enumerate available models at build time, rather than hardcoding model names.

**Investigation & Design:**
1. Review pi extension API docs (ExtensionAPI types, `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md` and `docs/extensions.md`).
2. Determine if the pi API exposes a model registry/list.
3. If yes: at tool-description build time, enumerate available models from the pi configuration.
4. If no: provide a user-editable fallback (e.g., `.pi/agent-models.md` or settings entry); document the mechanism.

**Changes:**
- In src/index.ts (fullAgentToolDescription build), add a section that lists available models (id + optional tier annotation + brief trait).
- If API unavailable, add a placeholder/comment directing users to edit a config file.

**Success Criteria:**
- Tool description includes a model catalog section (dynamic or user-editable).
- No hardcoded "claude-opus", "claude-sonnet", etc. in tier definitions (those use workload language in AGENTS.md).
- Concrete model defaults for built-in agents (e.g., "Explore preset to claude-haiku-4-5") are listed in the agent-type catalog for reference.

**Testing:**
- Verify description contains a models section.
- If dynamic: verify models list matches pi configuration.
- If fallback: verify comment/link to config file is present.

**Acceptance:** Description includes model catalog; API investigation documented.

---

### Task 3.4: Detect pi-fabric and add fabric section to tool description

**Description:** Enhance tool description to include a section on fabric_exec when pi-fabric is installed, omit it when absent.

**Investigation & Design:**
1. Review pi extension API to determine how to detect if pi-fabric is installed/active.
2. Options: check if fabric_exec tool is registered in the tool registry, OR check package presence in environment.
3. Design the detection mechanism feasible with the API.

**Changes:**
- At tool-description build time, check for pi-fabric presence.
- If present, append a section to fullAgentToolDescription:
  ```
  For long code-shaped workflows (dynamic chains, handovers, budgeted parallel fan-out, no per-step orchestrator cost),
  prefer fabric_exec's agents/workflow API. The Agent tool remains right for judgment-driven conversational loops.
  ```
- If absent, omit the section entirely.

**Success Criteria:**
- Tool description includes fabric section when pi-fabric is installed.
- Section is absent when pi-fabric is not installed.
- Section explains complement (not replacement) and use case (long workflows).

**Testing:**
- Mock pi-fabric present: verify fabric section appears.
- Mock pi-fabric absent: verify section is omitted.

**Acceptance:** Detection works; section appears/omits correctly.

---

## Phase 4: Get_Subagent_Result and Lifecycle Scripts

### Task 4.0: Enhance get_subagent_result for mid-run monitoring

**Description:** Enhance get_subagent_result to return richer progress info for running agents, supporting orchestrator mid-loop decision-making.

**Changes (src/index.ts, get_subagent_result tool):**
- For running agents, include in output:
  - Status: "running"
  - Turn count (tool uses count)
  - Recent tool activity summary (last 3-5 tool calls, one-line each; e.g., "read: src/index.ts", "grep: pattern X in Y")
  - Partial output tail (last 10-20 lines of accumulated output, if any)
- Preserve existing stats (context %, duration, compactions).

**Implementation notes:**
- Capture tool call names/brief summaries in agent record incrementally.
- Capture output incrementally; slice last 10-20 lines on status check.
- No new tools, polling loops, or push notifications.

**Success Criteria:**
- get_subagent_result for running agent shows status, turn count, recent activity, output tail.
- Allows orchestrator to make mid-loop decisions (monitor progress, check for blockers).

**Testing:**
- Integration test: spawn agent, call get_subagent_result mid-run, verify output includes recent activity + output tail.

**Acceptance:** Test passes; orchestrator can use output to decide next action.

---

### Task 4.1: Create scripts/postinstall.mjs

**Description:** Implement postinstall script that writes a marked guidance block to ~/.pi/agent/AGENTS.md with guard for CI and dev install.

**Changes:**
- Create new file: scripts/postinstall.mjs.
- Guard: check if process.env.CI is set or INIT_CWD resolves to the package's own directory; exit 0 if either guard matches (skip write on CI or dev install).
- Resolve ~/.pi/agent/AGENTS.md path.
- Create ~/.pi/agent/ directory if missing: mkdirSync(path.dirname(agentsMdPath), { recursive: true }).
- Read existing file (if exists); else empty string.
- Use regex to remove ALL existing pi-subagents blocks: /<!-- pi-subagents:begin[^>]*-->[\\s\\S]*?<!-- pi-subagents:end[^>]*-->/g (tolerant of any version tags).
- Extract user content (everything outside removed markers).
- Generate fresh guidance block with canonical unversioned markers and four-dial content.
- Reconstruct file: user content + fresh block.
- Write atomically: temp file in same directory + rename (catch and delete temp on failure).
- Handle fs errors gracefully (warn to stderr, continue; exit 0).

**Script Content (Guidance Block):**
Canonical unversioned markers: `<!-- pi-subagents:begin -->` and `<!-- pi-subagents:end -->`

Block content includes:
- Four-dial concept explanation (brief, brain, powers, knowledge).
- Workflow design guidance (sequential, parallel, dispatch-review-iterate).
- Routing principle (workload-based tier language: cheap/mid/strongest; no vendor names).
- Brief scaffold (Goal/Context/Scope/Acceptance/Return).
- Skill reference pattern (cite .md files by absolute path in brief).

**Success Criteria:**
- File created at scripts/postinstall.mjs.
- Script is executable (node ./scripts/postinstall.mjs works).
- Guard correctly skips write when CI=true or INIT_CWD = package dir (dev install).
- On fresh install, ~/.pi/agent/AGENTS.md is created with the marked block (directory auto-created).
- On reinstall, old blocks (any version tag) are replaced, user content outside markers preserved.
- Script does not fail the install if fs errors occur.
- Atomic write: temp + rename; cleanup on failure.

**Testing:**
- Unit test in test/lifecycle-scripts.test.ts (using Node.js fs mocking):
  - postinstall skips when CI=true (guard works).
  - postinstall skips when INIT_CWD = package dir (dev install guard).
  - postinstall on fresh machine creates ~/.pi/agent/AGENTS.md with block (directory auto-created).
  - postinstall on existing file with old block (any version tag) replaces it.
  - postinstall with duplicate blocks consolidates to one.
  - postinstall with malformed markers handles gracefully.
  - postinstall atomic write: temp file used, cleanup on failure.
  - postinstall with read failure warns and continues.
  - postinstall handles EACCES (write permission denied) gracefully (warns, continues).
  - Idempotence: postinstall run twice produces same file.

**Acceptance:** npm test passes; manual test on fresh machine verifies file creation; guards verified.

---

### Task 4.2: Create scripts/preuninstall.mjs

**Description:** Implement preuninstall script that removes the marked block from ~/.pi/agent/AGENTS.md.

**Changes:**
- Create new file: scripts/preuninstall.mjs.
- Resolve ~/.pi/agent/AGENTS.md path.
- If file does not exist, exit 0.
- Read file, remove ALL marked blocks (regex match on pi-subagents:begin/end, canonical or any legacy version tag).
- Pattern: /<!-- pi-subagents:begin[^>]*-->[\\s\\S]*?<!-- pi-subagents:end[^>]*-->/g (global, tolerant of versions).
- Write back remaining content (or delete file if empty).
- Handle fs errors gracefully (best-effort).

**Success Criteria:**
- File created.
- On uninstall, all marked blocks (canonical + any legacy version-tagged) are removed from AGENTS.md.
- User content outside markers is preserved.
- File is left empty or deleted if no user content remains (either outcome acceptable).
- Non-fatal if file does not exist or cannot be written.

**Testing:**
- Unit test in test/lifecycle-scripts.test.ts:
  - preuninstall removes all marked blocks (canonical and any version tags).
  - preuninstall preserves user content outside markers.
  - preuninstall with duplicate blocks removes all in one pass.
  - preuninstall handles missing file gracefully (no-op).
  - preuninstall is idempotent (running twice is safe).
  - preuninstall handles EACCES gracefully (best-effort, continues).

**Acceptance:** Tests pass; manual uninstall verification.

---

### Task 4.3: Register lifecycle scripts in package.json

**Description:** Add postinstall and preuninstall scripts to package.json.

**Changes:**
- In package.json, under "scripts":
  ```json
  "postinstall": "node ./scripts/postinstall.mjs",
  "preuninstall": "node ./scripts/preuninstall.mjs"
  ```

**Success Criteria:**
- npm install / npm update runs postinstall.
- npm uninstall runs preuninstall.

**Testing:**
- Manual test: npm install, verify AGENTS.md created at ~/.pi/agent/.

**Acceptance:** Manual verification + test pass.

---

## Phase 5: Documentation and Testing

### Task 5.1: Update README.md to document four-dial model, orchestrator, and optional subagent_type

**Description:** Add/update README sections on the four-dial model, workflow design, model tier routing, orchestrator supervision, brief scaffold, and optional subagent_type.

**Changes:**
- Find or create "Agent Tool" section in README.md.
- Add subsections:
  1. "Four-Dial Orchestration" — explain brief, brain, powers, knowledge.
  2. "Workflow Design" — sequential, parallel, dispatch-review-iterate shapes.
  3. "Model Tier Routing" — workload-based language (cheap/mid/strongest) and when to use.
  4. "Orchestrator Role and Active Supervision" — dispatch with briefs, monitor, steer, review, iterate.
  5. "Brief Scaffold" — Goal/Context/Scope/Acceptance/Return template.
  6. "Optional subagent_type" — omit type for bare general-purpose, specify type for preset powers.
  7. "Coordination Guidance" — link to ~/.pi/agent/AGENTS.md (lifecycle-script-managed).

**Success Criteria:**
- README is updated and reflects new model, orchestrator methodology, workload-based tier language.
- Examples show optional subagent_type.
- No vendor family names (Claude/Haiku/Sonnet) in tier descriptions.

**Testing:**
- Manual review; ensure no dead links or contradictions with design.

**Acceptance:** Peer review.

---

### Task 5.2: Add test coverage for optional subagent_type in test/agent-guards.test.ts

**Description:** Ensure agent-guards.test.ts covers optional subagent_type resolution (including undefined and unknown).

**Tests to Add:**
1. "Agent with missing/undefined subagent_type succeeds and uses general-purpose".
2. "Agent with unknown subagent_type falls back to general-purpose".
3. "Agent with subagent_type:'general-purpose' is identical to omitting type".
4. "Agent without type has access to all tools".
5. "Agent with type:'Explore' has access to read-only tools only".

**Success Criteria:**
- All tests pass.
- Coverage increases for schema validation and type resolution.

**Testing:**
- npm test passes; coverage report shows subagent_type optional path covered.

**Acceptance:** Tests pass.

---

### Task 5.3: Add test coverage for built-in prompt line counts and content

**Description:** Add tests in test/default-agents.test.ts to verify built-in prompts meet requirements (6 at <15 lines, orchestrator at ~30-40 lines, no routing heuristics).

**Tests to Add:**
1. Snapshot test: for each of six agents (general-purpose, Explore, Plan, worker, reviewer, oracle), assert prompt line count <15.
2. Snapshot test: for orchestrator, assert prompt line count ~30-40 (allow range, e.g., 25-45).
3. Keyword test: for all seven agents, assert prompt does not contain "threshold", "select the", "routing", "vendor", "Haiku", "Sonnet", "Opus".
4. Verification test: orchestrator contains keywords "dispatch", "monitor", "steer", "review", "iterate" (supervision methodology).

**Success Criteria:**
- Six agents <15 lines.
- Orchestrator ~30-40 lines with active supervision keywords.
- No routing tables or vendor names anywhere.

**Testing:**
- npm test passes.

**Acceptance:** Tests pass.

---

### Task 5.4: Add test coverage for lifecycle scripts

**Description:** Add test/lifecycle-scripts.test.ts with mocked fs to test postinstall/preuninstall behavior.

**Tests to Add:**
1. postinstall skips when CI=true (guard).
2. postinstall skips when INIT_CWD = package dir (dev install guard).
3. postinstall on fresh machine creates AGENTS.md with marked block.
4. postinstall on existing file with old pi-subagents block (any version tag) replaces it.
5. postinstall with duplicate blocks consolidates to one.
6. postinstall with malformed markers handles gracefully.
7. postinstall with read failure warns and continues.
8. postinstall handles EACCES (write permission denied) gracefully.
9. postinstall atomic write: temp file used, cleanup on failure.
10. preuninstall removes marked block from AGENTS.md (canonical or any version tag).
11. preuninstall preserves user content.
12. preuninstall handles missing file gracefully.
13. Block idempotence: postinstall run twice produces same file.

**Success Criteria:**
- All tests pass.
- fs mocking is clean; no actual ~/.pi/agent/ modifications during test.
- Guards verified (CI, dev install).
- Atomic writes verified (temp + rename, cleanup).

**Testing:**
- npm test passes; check test/lifecycle-scripts.test.ts coverage.

**Acceptance:** Tests pass; no side effects.

---

### Task 5.5: Add smoke test for tool description (no routing, dynamic content, orchestrator supervision)

**Description:** Add tests in test/agent-mode.test.ts or new test/agent-tool-description.test.ts to verify routing tables are absent, dynamic content present, and orchestrator supervision methodology documented.

**Tests to Add:**
1. fullAgentToolDescription does not contain "Explore threshold".
2. fullAgentToolDescription does not contain "Plan threshold".
3. fullAgentToolDescription does not contain "pick the most specific".
4. compactAgentToolDescription follows same assertions.
5. Description contains "agent types:" (catalog).
6. Description contains hard invariants (e.g., "self-contained").
7. Description contains model catalog section (dynamic or user-editable comment).
8. If pi-fabric detected: description contains fabric section with "fabric_exec", "workflow API", "conversational loops".
9. If pi-fabric absent: no fabric section present.
10. Explore agent builtinToolNames is READ_ONLY_TOOLS (["read", "bash", "grep", "find", "ls"]) and unchanged.
11. Orchestrator prompt contains "dispatch", "monitor", "steer", "review", "iterate" (supervision).

**Success Criteria:**
- Tests pass.
- Routing tables confirmed absent.
- Dynamic content (models, fabric) present/absent as expected.
- Orchestrator supervision methodology documented in template.
- Explore allowlist unchanged and correct.

**Testing:**
- npm test passes.

**Acceptance:** Tests pass.

---

## Phase 6: Validation and Sign-Off

### Task 6.1: Comprehensive integration test

**Description:** Run through full agent spawn cycles (with and without subagent_type); verify dispatch, tool access, orchestrator monitoring.

**Tests:**
1. Spawn Agent without subagent_type (bare general-purpose); verify dispatch, tool access, output.
2. Compare tool access to explicit type:"general-purpose" call; verify identical.
3. Spawn orchestrator agent; verify it can dispatch and call get_subagent_result on background workers.
4. Verify get_subagent_result for running agent returns status, turn count, recent activity, output tail.
5. Verify steer_subagent can send messages to running orchestrator.

**Success Criteria:**
- All spawn modes succeed.
- Tools are available correctly.
- Orchestrator can monitor and steer background workers.
- get_subagent_result returns rich progress info for running agents.

**Testing:**
- Integration test in test/integration.test.ts or similar.

**Acceptance:** Test passes.

---

### Task 6.2: TypeScript compilation and lint

**Description:** Ensure no type errors or lint violations after all changes.

**Commands:**
```bash
npm run typecheck
npm run lint
```

**Success Criteria:**
- Zero typescript errors.
- Zero lint violations.

**Testing:**
- Run locally before submitting.

**Acceptance:** Both commands pass.

---

### Task 6.3: Full test suite

**Description:** Run complete test suite and verify all tests pass.

**Command:**
```bash
npm test
```

**Success Criteria:**
- All tests pass.
- No regressions.
- New test coverage is in place.

**Testing:**
- Run locally.

**Acceptance:** npm test passes; coverage report shows improvements.

---

## Summary

- **Phase 1 (Schema):** 2 tasks — make subagent_type optional, validate dispatch default.
- **Phase 2 (Prompts):** 5 tasks — condense 6 built-in agent prompts to <15 lines, rewrite orchestrator for active supervision (~30-40 lines).
- **Phase 3 (Tool Description):** 4 tasks — remove routing tables, add dynamic model catalog, detect and add fabric section, verify compact/custom modes.
- **Phase 4 (Lifecycle Scripts):** 4 tasks — enhance get_subagent_result, implement postinstall/preuninstall with guards and atomic writes, register in package.json.
- **Phase 5 (Docs/Tests):** 5 tasks — update README, add test coverage for all areas, verify dynamic content and orchestrator supervision.
- **Phase 6 (Validation):** 3 tasks — comprehensive integration testing (orchestrator, monitoring, steering), typecheck/lint, full test suite.
- **Total:** 23 ordered tasks.
