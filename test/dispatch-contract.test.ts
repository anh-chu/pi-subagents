import { describe, expect, it } from "vitest";
import {
  buildRejectMessage,
  contractSignature,
  validateDispatch,
} from "../src/dispatch-contract.js";

const schema = {
  type: "object",
  required: ["goals", "scope"],
  properties: {
    goals: { type: "string" },
    scope: {
      type: "object",
      required: ["includes"],
      properties: {
        includes: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

describe("validateDispatch", () => {
  it("admits requests without a contract", () => {
    expect(validateDispatch(undefined, undefined)).toEqual({ ok: true });
  });

  it("admits a request matching the JSON Schema", () => {
    expect(validateDispatch(schema, {
      goals: "Fix the bug",
      scope: { includes: ["src/auth.ts"] },
    })).toEqual({ ok: true });
  });

  it("rejects missing required properties with paths", () => {
    const verdict = validateDispatch(schema, { scope: { includes: [] } });
    expect(verdict).toMatchObject({ ok: false });
    if (!verdict.ok) expect(verdict.errors.join("\n")).toContain("request must have required property 'goals'");
  });

  it("rejects wrong nested property types with paths", () => {
    const verdict = validateDispatch(schema, { goals: "Fix", scope: { includes: ["src/auth.ts", 1] } });
    expect(verdict).toMatchObject({ ok: false });
    if (!verdict.ok) expect(verdict.errors).toContain("/scope/includes/1 must be string");
  });

  it("fails open when an author schema cannot compile", () => {
    expect(validateDispatch({ type: "not-a-json-schema-type" }, {})).toEqual({ ok: true });
  });
});

describe("buildRejectMessage", () => {
  it("contains an error line and the JSON Schema", () => {
    const message = buildRejectMessage("worker", schema, ["request must have required property 'goals'"]);
    expect(message).toContain("- request must have required property 'goals'");
    expect(message).toContain(JSON.stringify(schema, null, 2));
  });
});

describe("contractSignature", () => {
  it("returns an empty signature without a schema", () => {
    expect(contractSignature(undefined)).toBe("");
  });

  it("renders a type-aware, one-level-nested shape", () => {
    expect(contractSignature(schema)).toBe("(goals: string, scope: { includes: [string] })");
  });

  it("collapses nesting deeper than the bound to object/array", () => {
    const deep = {
      type: "object",
      properties: {
        a: {
          type: "object",
          properties: {
            b: { type: "object", properties: { c: { type: "object", properties: { d: { type: "string" } } } } },
          },
        },
      },
    };
    expect(contractSignature(deep)).toBe("(a: { b: { c: object } })");
  });

  it("falls back to bare key names when the shape is too wide for a line", () => {
    const props: Record<string, unknown> = {};
    for (const k of ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]) {
      props[k] = { type: "string" };
    }
    const wide = { type: "object", properties: props };
    expect(contractSignature(wide)).toBe("(alpha, bravo, charlie, delta, echo, foxtrot, golf, hotel)");
  });

  it("renders bare names when required keys have no properties block", () => {
    expect(contractSignature({ type: "object", required: ["x", "y"] })).toBe("(x, y)");
  });
});
