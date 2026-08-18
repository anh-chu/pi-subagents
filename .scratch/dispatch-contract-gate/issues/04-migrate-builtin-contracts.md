# 04 — Migration: assign built-in contract floors (separate thread)

**What to build:** Turn the gate on for the real agent types by assigning each built-in a contract floor: `worker` → `writable`, Explore → `recon`, Plan → `planning`, reviewer → `review`, oracle → `audit`. general-purpose stays `loose`. This is the behaviour change: after it lands, real dispatches that violate a type's contract are rejected or (for risky writable work) routed through the dispatcher. Each floor is a code-anchored minimum that a same-named `.md` override may strengthen but not drop below.

This is intentionally a separate, deferrable thread run after the mechanism (01), dispatcher (02), and interposition (03) are in and verified. It is rolled out and reviewed on its own and is independently revertible. It does not block the earlier tickets.

**Blocked by:** 01 (and in practice sequenced after 02 and 03, but only 01 is a hard dependency).

**Status:** ready-for-agent

- [ ] Built-in types are assigned floors: worker=writable, Explore=recon, Plan=planning, reviewer=review, oracle=audit; general-purpose=loose.
- [ ] Each floor is code-anchored on the canonical type name; a same-named override can only strengthen it.
- [ ] The active global `worker.md` override is confirmed to inherit the `writable` floor and cannot drop below it.
- [ ] Real dispatches violating a type's contract are rejected with missing keys and example; risky writable dispatches route through the dispatcher.
- [ ] Rollout is independently revertible (contract assignment isolated from the mechanism).
- [ ] Regression check: a representative well-formed dispatch to each migrated type still admits and runs.
- [ ] `pnpm test`, typecheck, and lint pass.
