import { describe, expect, it } from "vitest";
import { WidgetSpecSchema, isEnumerableFilter, isSpecComplete, parseSpec } from "./types";

const validSpec = {
  view: "spans",
  filters: [{ field: "span_kind", op: "=", value: "LLM" }],
  metric: { measure: "cost", agg: "sum" },
  breakdown: "model_name",
  display: { type: "line" },
};

describe("WidgetSpecSchema", () => {
  it("accepts a valid spec", () => {
    expect(WidgetSpecSchema.safeParse(validSpec).success).toBe(true);
  });
  it("rejects unknown display type", () => {
    const bad = { ...validSpec, display: { type: "gauge" } };
    expect(WidgetSpecSchema.safeParse(bad).success).toBe(false);
  });
});

describe("isSpecComplete", () => {
  it("false while view or metric missing", () => {
    expect(isSpecComplete({ view: "spans" })).toBe(false);
    expect(isSpecComplete({ ...validSpec, metric: undefined })).toBe(false);
  });
  it("true for a runnable spec", () => {
    expect(isSpecComplete(validSpec)).toBe(true);
  });
});

describe("parseSpec", () => {
  it("applies defaults so filters is [] when omitted", () => {
    const { filters: _omit, ...withoutFilters } = validSpec;
    const result = parseSpec(withoutFilters);
    expect(result).not.toBeNull();
    expect(result!.filters).toEqual([]);
  });
});

describe("isEnumerableFilter", () => {
  const stringField = {
    type: "string" as const,
    label: "Model",
    filterOps: ["=", "!=", "contains"],
    groupable: true,
    aggs: [],
  };
  const numberField = { ...stringField, type: "number" as const, label: "Cost" };

  it("true for string equality ops (dropdown of stored values)", () => {
    expect(isEnumerableFilter(stringField, "=")).toBe(true);
    expect(isEnumerableFilter(stringField, "!=")).toBe(true);
  });
  it("false for contains (free text) and numeric fields", () => {
    expect(isEnumerableFilter(stringField, "contains")).toBe(false);
    expect(isEnumerableFilter(numberField, "=")).toBe(false);
  });
  it("false while no field or op picked", () => {
    expect(isEnumerableFilter(undefined, "=")).toBe(false);
    expect(isEnumerableFilter(stringField, "")).toBe(false);
  });
});
