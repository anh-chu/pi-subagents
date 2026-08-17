/** Generic JSON Schema dispatch-contract validation for Agent requests. */

import Ajv, { type ValidateFunction } from "ajv";
import type { AgentConfig } from "./types.js";

export type DispatchSchema = Record<string, unknown>;
export type DispatchRequest = Record<string, unknown>;
export type DispatchVerdict = { ok: true } | { ok: false; errors: string[] };

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap<object, ValidateFunction>();

export function getContract(config: AgentConfig | undefined): DispatchSchema | undefined {
  const contract = config?.contract;
  return contract !== null && typeof contract === "object" && !Array.isArray(contract)
    ? contract
    : undefined;
}

export function validateDispatch(
  schema: DispatchSchema | undefined,
  request: DispatchRequest | undefined,
): DispatchVerdict {
  if (schema === undefined) return { ok: true };

  let validator = validators.get(schema);
  try {
    if (!validator) {
      validator = ajv.compile(schema);
      validators.set(schema, validator);
    }
  } catch (error) {
    console.warn("Failed to compile dispatch contract; allowing dispatch:", error);
    return { ok: true };
  }

  if (validator(request ?? {})) return { ok: true };
  return {
    ok: false,
    errors: (validator.errors ?? []).map(({ instancePath, message }) =>
      `${instancePath || "request"} ${message}`,
    ),
  };
}

export function buildRejectMessage(subagentType: string, schema: DispatchSchema, errors: string[]): string {
  return [
    `Dispatch rejected: the "${subagentType}" contract was not satisfied.`,
    ...errors.map((error) => `- ${error}`),
    "",
    "The agent contract is:",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bounded, one-line shape of a JSON Schema node. Nesting collapses past `depth`. */
function renderShape(node: unknown, depth: number): string {
  if (!isObject(node)) return "any";
  const t = node.type;
  if (t === "string" || t === "number" || t === "integer" || t === "boolean" || t === "null") {
    return t;
  }
  if (t === "array") {
    return depth <= 0 ? "array" : `[${renderShape(node.items, depth - 1)}]`;
  }
  if (t === "object" || isObject(node.properties)) {
    if (depth <= 0) return "object";
    const props = isObject(node.properties) ? node.properties : undefined;
    const keys = props ? Object.keys(props) : [];
    if (!props || keys.length === 0) return "object";
    return `{ ${keys.map((k) => `${k}: ${renderShape(props[k], depth - 1)}`).join(", ")} }`;
  }
  return "any";
}

/**
 * One-line, type-aware contract signature for the agent type list, for example
 * `(goals: string, scope: { includes: [string] })`. Nesting is bounded to keep
 * it to a line; a schema too wide to render falls back to bare key names. Empty
 * string when the agent declares no contract.
 */
export function contractSignature(schema: DispatchSchema | undefined): string {
  if (!schema) return "";
  const props = isObject(schema.properties) ? schema.properties : undefined;
  const required = Array.isArray(schema.required) && schema.required.every((k) => typeof k === "string")
    ? (schema.required as string[])
    : undefined;
  const keys = props ? Object.keys(props) : (required ?? []);
  if (keys.length === 0) return "";
  const sig = `(${keys.map((k) => (props ? `${k}: ${renderShape(props[k], 2)}` : k)).join(", ")})`;
  return sig.length > 100 ? `(${keys.join(", ")})` : sig;
}
