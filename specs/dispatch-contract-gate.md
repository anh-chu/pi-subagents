# Spec: Generic Dispatch Contract Gate

Status: implemented (Layer 1). Layer 2 deferred (see Deferred section).
Area: `src/index.ts` dispatch path, `src/dispatch-contract.ts`, agent config layer.

## Problem Statement

Agents sometimes receive structured requests with the wrong shape. The request should be checked before spawn, without spending a subagent turn, while leaving agents without an explicit contract unchanged.

## Solution

A deterministic hook runs at the shared `Agent` dispatch chokepoint before either spawn branch. Each agent may declare `contract` as a plain JSON Schema object. The `Agent` tool accepts an optional open `request` object. Ajv validates that request against the selected agent's schema with all errors enabled. The validator is generic: it has no knowledge of field names, agent roles, profiles, git state, risk signals, or domain semantics.

When validation fails, dispatch is rejected before spawn. The response lists formatted failing paths and shows the agent's pretty-printed schema, so rejection teaches the caller the required shape. A missing contract is inert and always admits. If an author's schema cannot compile, validation fails open and dispatch proceeds; one broken contract cannot block an agent.

A one-line, type-aware signature derived from the schema is surfaced in the agent type list, for example `(goals: string, scope: { includes: [string] })`. Nesting is bounded (deeper levels collapse to `object`/`array`, and a schema too wide for a line falls back to bare key names). This gives callers the request shape, not just key names, without requiring a pre-read. The agent type list also now uses the full description in compact mode rather than only the first sentence.

## User Stories

1. As a main agent, I want a request that does not match an agent's declared JSON Schema rejected before spawn.
2. As a main agent, I want rejection errors to identify failing paths so I can correct the request.
3. As a main agent, I want rejection to show the target schema so I can learn the accepted shape in-session.
4. As a custom-agent author, I want to define arbitrary request fields and nested structural/type constraints in frontmatter.
5. As a custom-agent author, I want agents without a contract to keep working unchanged.
6. As a platform owner, I want schema validation to run with zero subagent tokens and be unit-testable as a pure function.
7. As a platform owner, I want a broken author schema to fail open rather than block dispatch globally.
8. As a platform owner, I want the schema shape surfaced in the type list.

## Implementation Decisions

### Generic JSON Schema contracts

- `contract` is a JSON Schema object stored on `AgentConfig`.
- `request` is an open object. No fixed field set is imposed by the tool schema.
- A single module-level `new Ajv({ allErrors: true, strict: false })` validates contracts.
- Compiled validators are cached in a `WeakMap<object, ValidateFunction>` keyed by schema object identity. Stable schema objects loaded from config therefore compile once.
- Missing `request` is validated as `{}`, so required-property errors still appear.
- Ajv errors format as `${instancePath || "request"} ${message}`.

### End-user configuration

Custom agent `.md` frontmatter accepts a `contract` object. Nested YAML objects are passed through as a `Record<string, unknown>` JSON Schema. Non-object values are ignored. Example:

```yaml
contract:
  type: object
  required: [goals, scope]
  properties:
    goals: { type: string }
    scope:
      type: object
      required: [includes]
      properties:
        includes: { type: array, items: { type: string } }
```

An agent with no `contract` admits any request. The contract gate is independent of the top-level `files` collision metadata and performs no git-state checks.

### Layer 1: deterministic hook

- `validateDispatch(schema, request)` returns `{ ok: true }` or `{ ok: false, errors }`.
- The hook runs after schedule/resume early returns and before background or foreground spawn.
- Invalid requests never spawn.
- Schema compilation errors log a warning and return `{ ok: true }`.
- `buildRejectMessage` includes error lines and pretty-printed schema.
- `contractSignature` returns an empty string without a schema; otherwise it uses `required` string keys, falling back to top-level `properties` keys.

### Surfacing the contract to the caller

Do not require the main agent to read an agent file first. Embed the schema-derived signature in the existing type list, then provide the complete schema on rejection.

## Testing Decisions

The highest seam is the pure `validateDispatch` function. Tests cover no-contract admission, valid nested requests, missing and wrong-typed values with paths, reject-teaches output, schema-derived signatures, and fail-open behavior for an uncompilable schema.

## Out of Scope

- Curated or named contract profiles.
- Hardcoded field semantics, required-field lists, acceptance heuristics, file ownership rules, baseline rules, git-state checks, or risk signals.
- Assigning contracts to built-in agents; contracts are declared by agent configuration.

## Deferred: Layer 2 (LLM judgment)

A second, non-deterministic layer was scoped but deliberately deferred: a mandatory read-only dispatcher subagent consulted when Layer 1 admits but risk signals remain. It would judge atomicity and routing and return `ADMIT | REJECT | REROUTE`, reusing pi's provider stack, with fail-open-on-infra / fail-closed-on-REJECT and a logged override.

It is deferred because it is the expensive part (spawned session, reuse lifecycle, deadlock/recursion hazards). Add judgment only if mis-shaped requests survive generic Layer 1 validation in real use; measure the deterministic catch rate first.
