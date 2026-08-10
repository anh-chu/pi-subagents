# Requirements: Four-Dial Pivot

## Schema: Optional subagent_type

**GIVEN** the Agent tool schema
**WHEN** a caller omits the `subagent_type` parameter
**THEN** dispatch executes with general-purpose agent type, inheriting all available tools (no filtering)
**AND** success is identical to explicitly passing `subagent_type: "general-purpose"`

**GIVEN** a caller specifies `subagent_type: "Explore"`
**WHEN** Agent dispatches
**THEN** the Explore agent's built-in tool list (read-only tools) is enforced as before

**GIVEN** an invalid or unknown `subagent_type`
**WHEN** dispatch is attempted
**THEN** dispatch falls back to general-purpose agent, preserving current behavior

## Built-in System Prompts: <15 Lines (6 Personas); Orchestrator ~30-40 Lines

**GIVEN** each of six default agents (general-purpose, Explore, Plan, worker, reviewer, oracle)
**WHEN** its system prompt is composed
**THEN** the prompt is under 15 lines and contains:
- Capability statement (what the agent does)
- Output contract (what the caller can expect back)
- NO task methodology, NO routing heuristics, NO multi-step walkthrough

**GIVEN** the orchestrator built-in agent
**WHEN** its system prompt is composed
**THEN** the prompt is ~30-40 lines, focused on active supervision methodology:
- Role: dispatch with complete briefs, monitor background agents via periodic check-ins (get_subagent_result), steer drift early (steer_subagent), review work before accepting, iterate with follow-ups.
- Output contract: summary of dispatch decisions, monitoring findings, final synthesis.
- Rationale: prevent fire-and-forget failures; enable observation-driven iteration.
- NO routing tables (those live in AGENTS.md).

**GIVEN** a custom project or global agent with a system prompt
**WHEN** it is loaded
**THEN** the custom prompt is preserved entirely (no line count or content constraints)

## Tool Description: No Routing Tables; Dynamic Model Catalog; Fabric Section

**GIVEN** the Agent tool description (all modes: full, compact, custom)
**WHEN** it is rendered
**THEN** no routing tables, thresholds, or "agent selection guidelines" are present in package-authored text
**AND** the description includes:
- Agent type catalog (minimal one-line description per type)
- Parameter schema overview
- Hard invariants only (self-contained briefs, file fencing, verify before accept)
- Guidance on parallel work, resumption, steering, scheduling
- Dynamic model catalog: available models enumerated at build time from the pi configuration (OR user-editable fallback if pi API does not expose a registry)

**GIVEN** the Agent tool description AND pi-fabric is installed/active
**WHEN** the description is rendered
**THEN** a section on fabric_exec is appended: for long code-shaped workflows (dynamic chains, handovers, budgeted parallel fan-out, no per-step orchestrator token cost), prefer fabric_exec's agents/workflow API; Agent tool remains right for judgment-driven conversational loops. When pi-fabric is absent, the section is omitted entirely.

**GIVEN** a user-authored custom tool description template
**WHEN** it is loaded and rendered
**THEN** dynamic variables (typeList, compactTypeList, agentDir, scheduleGuideline) are available for interpolation; guidelines is deprecated and renders as empty
**AND** the rendered description is not curated by the tool for routing advice

## Lifecycle Scripts: postinstall and preuninstall

### postinstall

**GIVEN** a fresh installation of pi-subagents (first npm install or update)
**WHEN** npm lifecycle scripts fire
**THEN** a postinstall script executes, writing a marked block into `~/.pi/agent/AGENTS.md`:
- Create the file and `~/.pi/agent/` directory if they do not exist
- Block is delimited by unversioned canonical markers: `<!-- pi-subagents:begin -->` and `<!-- pi-subagents:end -->` (replacement regex tolerates any version tags in legacy markers)
- Block contains AGENTS.md guidance: four-dial concept, workflow design (sequential/parallel/dispatch-review-iterate shapes), routing principle (workload-based tier language, no vendor names), brief scaffold, skill reference patterns
- *Note: Active supervision methodology is intentionally excluded from this guidance block; it lives exclusively in the orchestrator built-in template (src/default-agents.ts).*
- Guard: exit 0 without writing if process.env.CI is set OR INIT_CWD resolves to the package's own directory (dev install)

**GIVEN** `~/.pi/agent/AGENTS.md` already exists with an old or duplicate pi-subagents block
**WHEN** postinstall runs (on update)
**THEN** all old marked blocks (any version) are removed and replaced with a single new one
**AND** any user content outside the marked blocks is preserved verbatim

**GIVEN** the installation environment does not have write permission to `~/.pi/agent/AGENTS.md`
**WHEN** postinstall attempts to write
**THEN** the script logs a warning and continues (non-fatal; install succeeds)

**GIVEN** postinstall completes successfully
**WHEN** the user reads `~/.pi/agent/AGENTS.md`
**THEN** the guidance block is current and properly formatted

### preuninstall

**GIVEN** the user uninstalls pi-subagents (npm uninstall)
**WHEN** preuninstall script fires
**THEN** the marked block (<!-- pi-subagents:begin -->...<!-- pi-subagents:end -->, unversioned) is removed from `~/.pi/agent/AGENTS.md`
**AND** the file is left empty if no other content existed
**AND** any user content outside the markers is preserved

**GIVEN** `~/.pi/agent/AGENTS.md` does not exist
**WHEN** preuninstall runs
**THEN** the script does nothing (no error)

**GIVEN** preuninstall completes
**WHEN** the user checks `~/.pi/agent/AGENTS.md`
**THEN** the pi-subagents block is gone; user edits outside markers remain

## Markers: Unversioned Canonical Format and Idempotence

**GIVEN** the AGENTS.md block uses canonical unversioned markers (e.g., `<!-- pi-subagents:begin -->` / `<!-- pi-subagents:end -->`)
**WHEN** postinstall runs
**THEN** marker matching is regex-based, tolerant of any legacy version tags: `<!-- pi-subagents:begin[^>]*-->` and `<!-- pi-subagents:end[^>]*-->` (global, matches and removes any version-tagged markers)

**WHEN** a user or system has legacy version-tagged markers
**THEN** postinstall detects and consolidates all pi-subagents blocks (any version) into one canonical unversioned block

**GIVEN** postinstall runs twice without uninstall
**WHEN** the block is identical in content
**THEN** no unnecessary changes occur (idempotent)

## Atomic Write

**GIVEN** postinstall or preuninstall script modifies `~/.pi/agent/AGENTS.md`
**WHEN** the file is written
**THEN** the write is atomic: temp file in the same directory + rename (not bare writeFileSync)
**AND** if temp write fails, the original file is not corrupted

## Tier Naming: Workload-Based Language Only

**GIVEN** tier descriptions in tool description, orchestrator template, or AGENTS.md block
**WHEN** they are written
**THEN** language is workload-based (cheap/extraction and grunt work; mid/bounded implementation; strongest available/ambiguous design and high-stakes review)
**AND** no vendor family names (Claude/Haiku/Sonnet/Opus) appear in tier definitions
**AND** concrete built-in agent model defaults (e.g., "Explore preset to claude-haiku-4-5") can appear in the agent-type catalog for reference

## Mid-Run Check-In Ergonomics

**GIVEN** a caller invokes get_subagent_result for a still-running agent
**WHEN** the tool executes
**THEN** the output includes:
- Status: "running"
- Turn count (tool uses count)
- Recent tool activity summary (one-line per last N tool calls, e.g., last 3 or 5)
- Partial output tail (last 10-20 lines of accumulated output, if any)
**AND** no new tools, polling loops, or push notifications are introduced

## Non-Goals (Out of Scope)

- Push-based progress notifications or polling loops.
- Fabric replacement (fabric is a complement, not a replacement).
- Skills parameter, agent registry removal, core runner/guard changes, steering/resume/schedule changes.
