# 02 — Dispatcher subagent and structured verdict

**What to build:** A dedicated read-only dispatcher agent type that, when spawned with a target type, its resolved contract, the request, and repo signals, judges whether the dispatch should proceed and emits a structured verdict: `ADMIT`, `REJECT { missing, reasons }`, or `REROUTE { suggested_type, why }`. The verdict is delivered through an injected scoped tool (`emit_verdict`), not parsed from prose. A pure parser turns the emitted verdict into a typed result the tool can act on. Not yet wired into the dispatch path — validated in isolation.

**Blocked by:** 01 (needs the resolved-contract shape and the fixture type to validate against).

**Status:** ready-for-agent

- [ ] A read-only dispatcher agent type exists (bash, read, grep; no `Agent` tool).
- [ ] An `emit_verdict` custom tool is injected into the dispatcher session, following the existing `write_output` / `createChainOutputTool` injection pattern.
- [ ] The dispatcher receives target type, resolved contract, full request, and repo signals; it may inspect the repo to confirm referenced paths/commits exist.
- [ ] Verdict shape is `ADMIT | REJECT { missing, reasons } | REROUTE { suggested_type, why }`.
- [ ] A pure parser converts an emitted verdict into a typed result; a malformed or missing verdict is classified as an infrastructure error (not a REJECT).
- [ ] Verdict-parser unit tests cover ADMIT, REJECT, REROUTE, and malformed/missing.
- [ ] Spawning the dispatcher manually against the fixture from ticket 01 produces a structured verdict end-to-end.
- [ ] `pnpm test`, typecheck, and lint pass.
