# 01 — Dispatch hook mechanism (inert)

**What to build:** A deterministic contract hook on the `Agent` tool. The tool accepts a structured `request` (goal, scope, acceptance, return_format, files, details) alongside the existing `prompt`. Before any spawn, a pure validator compares the request against the target type's resolved contract and either admits or rejects. On reject, the caller gets the exact missing keys plus a filled example for that type. Each contracted type's required-key signature is shown in the rendered agent type list, so the caller sees the contract without reading any file.

The mechanism lands inert: every type (including built-in `worker`) resolves to the `loose` profile, so no real dispatch is rejected and production behaviour is unchanged. The vertical path is proven end-to-end against one opt-in contracted fixture type used only in tests.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `Agent` tool exposes a structured `request` param with the fixed field set (goal, scope, acceptance, return_format, files, details); shape validated by the harness's static schema.
- [ ] The two existing spawn branches (background and foreground) are prefactored into a single dispatch chokepoint that the hook runs at.
- [ ] A single pure `validateDispatch(config, request, repoSignals)` returns admit, reject `{ missing, reasons }`, or an admit-with-`needsJudgment` flag (flag has no consumer yet).
- [ ] Contract resolution exists with a `loose` default; all real types resolve to `loose` on landing (zero behaviour change).
- [ ] Frontmatter `dispatch_contract` is parsed (profile name, inline rules object, or omitted → loose); frontmatter may only strengthen a same-named built-in floor, never weaken it.
- [ ] Required-ness is enforced at runtime by the validator, not by the static param schema; authors cannot add new request field names.
- [ ] On reject, the tool returns the missing keys and a filled example for the target type; no spawn occurs.
- [ ] Each contracted type's required-key signature is embedded in the rendered type list (survives compact mode).
- [ ] One opt-in contracted fixture type exercises the full path: a malformed dispatch to it is rejected, a well-formed one is admitted.
- [ ] Unit tests mirror `test/agent-guards.test.ts` style (pure inputs, no spawning): missing keys rejected, writable-without-files rejected, read-only-without-files allowed, dirty-tree-without-baseline rejected, clean tree admitted, vague acceptance rejected, observable acceptance admitted, risk trigger sets `needsJudgment`, loose types pass through.
- [ ] `pnpm test`, typecheck, and lint pass.
