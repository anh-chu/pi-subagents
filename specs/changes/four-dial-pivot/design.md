# Design: Four-Dial Pivot

## Schema Changes: Optional subagent_type

### Current Schema (TypeBox)
The Agent tool defines `subagent_type` as required in the parameters object.

### New Schema
Make `subagent_type` optional by wrapping the property with Type.Optional() in TypeBox. Property optionality in TypeBox is determined by the field wrapper (Type.Optional vs Type.String), not a separate required list:

```typescript
// In src/index.ts, the Agent parameter definition:
const agentToolParams = Type.Object({
  // ...existing params...
  subagent_type: Type.Optional(Type.String({
    description: "Agent type. Available: ..."
  })),
  // ...rest of params...
});
```

### Dispatch Logic (agent-runner.ts / invocation-config.ts)

When `subagent_type` is undefined:
1. Default to "general-purpose" internally.
2. Resolve tools: general-purpose has no `builtinToolNames` restriction, so all available tools are granted.
3. Proceed with normal dispatch.

No changes needed to guards, resolution, or tool availability beyond this default.

## Built-in Prompts: Reduced to <15 Lines

Each default agent's system prompt in `src/default-agents.ts` is condensed to:
- Capability posture (one-two sentences: what does this agent do?)
- Output contract (one-two sentences: what format/structure does the caller expect?)
- NO task walkthrough, NO routing heuristics, NO multi-step guidance.

### Example Refactoring (before/after)

**Before (Explore, ~80 lines):**
```
# CRITICAL: READ-ONLY MODE...
[Long section on tool usage prohibitions]
[Section on Scope Discipline]
[Section on Output]
[Many paragraphs of methodology]
```

**After (Explore, ~12 lines):**
```
# Explore: Targeted Codebase Search
Read-only file and content search specialist. Searches codebases methodically using find, grep, read.
Does NOT create, modify, or delete files.

Output: Absolute file paths with line:col citations and minimal code snippets.
```

All seven built-in agents (general-purpose, Explore, Plan, worker, reviewer, oracle, orchestrator) follow this pattern.

**Key Preservation:**
- Tool allowlists (builtinToolNames) unchanged.
- Model defaults and lockModel flags unchanged.
- Capability profiles and permission boundaries unchanged.
- Only the narrative/methodology removed.

## Tool Description Changes

### Current State (src/index.ts, fullAgentToolDescription)

The description includes:
- Agent type listings (with routing guidelines embedded).
- Routing tables (e.g., "Explore threshold: X", "Plan threshold: Y").
- Task selection heuristics ("pick the most specific type").
- Multi-step methodology advice.

### New State

The description includes:
- Agent type catalog (name + one-line capability).
- Parameter schema summary.
- Hard invariants:
  - Prompts must be self-contained.
  - File fencing for integrity.
  - Verification before accepting results.
- Parallel work guidance (run_in_background, file isolation).
- Resume/steer/schedule notes.
- Dynamic model catalog (see below).
- Fabric section if pi-fabric is installed (see below).

**Removed:**
- Routing tables and thresholds.
- "Agent selection guidelines" heuristics.
- Multi-step methodologies (move to AGENTS.md).

**Compact and Custom Modes:**
- Compact shrinks the remaining guidance proportionally.
- Custom mode still interpolates dynamic parts (typeList, compactTypeList, agentDir, scheduleGuideline) but the guidance prose is user-authored and not curated for routing.
- The {{guidelines}} placeholder is deprecated; postinstall scripts should omit it from custom templates. If present in legacy templates, it will render as empty.

## Dynamic Model Catalog

### Design

At tool-description build time, the Agent tool description should enumerate models actually available in the user's pi configuration, rather than hardcoding model names.

**Approach:**
1. Query the pi extension API for a model registry (investigate ExtensionAPI type definitions and pi docs at `/home/sil/.local/share/fnm/node-versions/v24.14.1/installation/lib/node_modules/@earendil-works/pi-coding-agent/docs`, especially `docs/models.md` and `docs/extensions.md`).
2. At description build time, enumerate available models (id + optional user-supplied cost/quality annotations).
3. Render a compact catalog in the tool description.
4. **Fallback:** If the pi API does not expose a registry, provide a user-editable section in the custom tool description template (e.g., `.pi/agent-models.md` or settings entry); nothing hardcoded.
5. **Implementation verification item:** Confirm whether pi extension API provides model registry access.

### Content

The catalog section lists:
- Model provider/id (e.g., "anthropic/claude-opus-20250514").
- Optional tier annotation (cheap/mid/strongest) from user config, if available.
- Brief trait (e.g., "vision support", "extended thinking") if available.

## Fabric Section (Runtime-Detected)

### Design

When pi-fabric is installed and active, the tool description appends a section on when to use fabric_exec instead of the Agent tool.

**Detection mechanism:**
1. Check if the `fabric_exec` tool is registered among available tools (query ExtensionAPI or check tool registry at dispatch time).
2. OR check if the @earendil-works/pi-fabric package is present in the environment.
3. When detected, append a section; when absent, omit it entirely.
4. **Implementation verification item:** Confirm feasibility against pi extension API.

### Content

When pi-fabric is present:
```
For long code-shaped workflows (dynamic chains, handovers between subagents, budgeted
parallel fan-out, no per-step orchestrator token cost), prefer fabric_exec's agents/workflow
API over repeated Agent calls. The Agent tool remains the right choice for judgment-driven
conversational loops and observation-based iteration.
```

When absent: omit the section entirely.

## Lifecycle Scripts: postinstall and preuninstall

### Location and Entry Points

**File:** `scripts/postinstall.mjs` (ESM, runs via npm lifecycle)
**Entry:** In `package.json`:
```json
{
  "scripts": {
    "postinstall": "node ./scripts/postinstall.mjs",
    "preuninstall": "node ./scripts/preuninstall.mjs"
  }
}
```

### postinstall.mjs

Pseudocode:
```
1. Guard: exit 0 if process.env.CI is set OR INIT_CWD resolves to package's own directory.
2. Resolve ~/.pi/agent/AGENTS.md path.
3. Create ~/.pi/agent/ directory if missing (mkdirSync with recursive: true).
4. Read existing file if present; else empty string.
5. Use regex to find and remove ALL existing pi-subagents blocks (any version tag).
   Pattern: /<!-- pi-subagents:begin[^>]*-->[\s\S]*?<!-- pi-subagents:end[^>]*-->/g
6. Extract user content (everything outside removed markers).
7. Generate fresh guidance block with canonical unversioned markers.
8. Reconstruct file: user content + fresh block.
9. Write atomically: temp file in same directory + rename (handle failures gracefully with warning).
10. Exit 0 (success; installation continues).
```

**Guidance Block Content:**
- Four-dial concept: brief, brain, powers, knowledge.
- Workflow design guidance: sequential, parallel fan-out, dispatch-review-iterate shapes; choose per step between bare dispatch, built-in templates, custom agents.
- Routing principle (workload-based tier language, no vendor names): cheap for extraction/grunt; mid for bounded implementation; strongest for ambiguous design/review.
- Brief scaffold: Goal, Context, Scope, Acceptance, Return.
- Skill reference pattern: cite .md files by absolute path in the brief, not a skills parameter.

*Note: Active supervision methodology is intentionally excluded from AGENTS.md guidance; it lives exclusively in the orchestrator built-in template (src/default-agents.ts).*

**Markers (Canonical, Unversioned):**
```
<!-- pi-subagents:begin -->
...guidance...
<!-- pi-subagents:end -->
```
Marker matching is regex-based and tolerates any legacy version tags: `<!-- pi-subagents:begin[^>]*-->` and `<!-- pi-subagents:end[^>]*-->`, allowing safe consolidation of any version-tagged legacy blocks into a single canonical unversioned block.

### preuninstall.mjs

Pseudocode:
```
1. Resolve ~/.pi/agent/AGENTS.md path.
2. If file does not exist, exit 0.
3. Read file.
4. Remove ALL marked blocks (regex match on pi-subagents:begin/end, canonical or any version).
5. If file is now empty, delete it or leave empty (either outcome acceptable).
6. Else, write the remaining content back.
7. Exit 0 (best-effort; do not fail uninstall).
```

### Implementation Notes

- Both scripts use Node.js fs sync API (simple, no external deps).
- postinstall guard: check process.env.CI and INIT_CWD before attempting write; exit 0 if either guard matches (dev install, CI environment).
- postinstall uses a try-catch; any fs error (including missing ~/.pi/agent/ dir or write permission denied) logs a warning to stderr but does not fail the install.
- preuninstall is best-effort and non-fatal; failures log warnings.
- Atomic write: temp file in same directory + rename (Node.js fs guarantees atomicity on POSIX); cleanup on failure (catch block deletes temp file).
- Scripts are standalone; no TypeScript/build step needed.

### Edge Cases and Testing

**Postinstall edge cases:**
- Missing `~/.pi/agent/` directory: create it with mkdirSync(path, { recursive: true }).
- Duplicate blocks: consolidate all pi-subagents blocks into one on postinstall.
- Malformed markers: fall back to simple substring search if regex fails; log warning and continue.
- Read/write failures: non-fatal; warn and exit 0.
- Atomic write: use writeFileSync; Node.js fs guarantees atomicity on POSIX systems for small files.

**Preuninstall edge cases:**
- Missing file: exit 0 (no-op).
- Duplicate blocks: remove all in one pass.
- Malformed markers: best-effort cleanup (warn and skip).
- Cannot delete file if now empty: leave empty (acceptable outcome).

**Test coverage to add (test/lifecycle-scripts.test.ts):**
- Postinstall with missing directory creates ~/.pi/agent/AGENTS.md.
- Postinstall with duplicate blocks removes all and writes one.
- Postinstall with malformed markers handles gracefully.
- Postinstall with read failure warns and continues.
- Postinstall with write failure (EACCES) warns and continues.
- Preuninstall removes marked block(s) and preserves user content.
- Preuninstall with missing file exits cleanly.
- Idempotence: postinstall twice produces same file.

## Orchestrator Built-in: Active Supervision Methodology

The orchestrator is the single exception to the <15-line rule. Its system prompt (~30-40 lines) is rewritten to embed active supervision methodology:

**Prompt focus:**
- Role: dispatch agents with complete, self-contained briefs; monitor background agents during execution via periodic check-ins (get_subagent_result); steer drift early using steer_subagent; review work before accepting; iterate with follow-up workers on findings.
- Output contract: decision summary (agents dispatched, their briefs, expectations), monitoring findings (progress, issues, mid-run adjustments), final synthesis and recommendations.
- **Rationale:** observed failure mode is main agents throwing tasks at subagents with zero oversight. Supervision methodology prevents lost context and enables responsive course correction.
- **No routing tables:** those live in AGENTS.md; the orchestrator focuses on technique.

**Key actions in the template:**
- Dispatch: summarize why you're sending this task, what you expect back, what success looks like.
- Monitor: call get_subagent_result periodically while agent runs; capture progress and blockers.
- Steer: send steer_subagent messages if the agent drifts or you discover new constraints.
- Review: check results against expectations before declaring success; iterate if needed.
- Synthesize: extract key findings and next steps from all dispatched work.

## Mid-Run Check-In Ergonomics

The get_subagent_result tool is enhanced to support orchestrator monitoring:

**For a running agent, the output includes:**
- Status: "running"
- Type (displayName) and agent ID
- Turn count (tool uses count)
- Recent tool activity summary (one-line per last 3-5 tool calls, e.g., "read: src/index.ts", "grep: pattern X in Y")
- Partial output tail (last 10-20 lines of accumulated output, if any)
- Stats: context %, duration elapsed, compactions if any

**Design notes:**
- No new tools, polling loops, or push notifications introduced.
- Fits the existing get_subagent_result call pattern (orchestrator calls it mid-loop).
- Implementation: capture tool calls and output incrementally in the agent record, surfaced on status check.

## Minimal Changes to Core Dispatch

The main `Agent` tool definition and dispatch logic remain intact:
- `agentInvokeCommand` and friends unchanged except for optional `subagent_type` handling.
- `resolveAgentInvocationConfig` and `resolveModel` work as before; they simply treat undefined subagent_type as "general-purpose".
- No changes to guards (agent-guards.ts), runner, manager, or recovery.
- Steering, resume, schedule unaffected.

## Tier Naming: Workload-Based Language Only

Wherever tiers are described (tool description, orchestrator template, AGENTS.md block):
- Use workload-based language: **cheap** for extraction and grunt work, **mid** for bounded implementation, **strongest available** for ambiguous design and high-stakes review.
- NO vendor family names (Claude, Haiku, Sonnet, Opus) in tier definitions.
- Concrete built-in agent model defaults (e.g., "Explore preset to claude-haiku-4-5") may appear in the agent-type catalog for reference, but are NOT used for tier routing.

## Testing Strategy

See tasks.md for detailed test additions.

**Summary:**
- Unit tests for optional `subagent_type` resolution (agent-guards.test.ts, invocation-config.test.ts).
- Snapshot or string tests for built-in prompts (6 at <15 lines, orchestrator at ~30-40 lines; no routing heuristics).
- Lifecycle script tests (Node.js fs mocking; postinstall/preuninstall idempotence, block replacement, user content preservation, CI/dev-install guards, atomic writes).
- Tool description smoke test (no routing tables present; schema and invariants documented; dynamic model catalog and fabric section detected correctly).

## Documentation

README.md Agent Mode section and main tool documentation updated to reflect:
- Optional `subagent_type`.
- Four-dial concept (brief, brain, powers, knowledge).
- Workflow design guidance (sequential, parallel, dispatch-review-iterate).
- Model tier routing (workload-based language, no vendor names).
- Brief scaffold.
- Link to AGENTS.md for coordination guidance.

AGENTS.md guidance block (lifecycle-script-managed) is the primary source of coordination wisdom; tool description is a compact reference.
