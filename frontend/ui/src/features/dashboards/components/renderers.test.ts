import { describe, expect, it } from "vitest";
import { pivotRows } from "./renderers";

describe("pivotRows", () => {
  it("pivots bucket+breakdown rows into one series per breakdown value, zero-filling missing combos", () => {
    const out = pivotRows(
      ["bucket", "model_name", "value"],
      [
        ["2026-06-01T00:00:00", "gpt-4o", 1],
        ["2026-06-01T00:00:00", "haiku", 2],
        ["2026-06-02T00:00:00", "gpt-4o", 3],
      ],
    );
    expect(out.seriesKeys).toEqual(["gpt-4o", "haiku"]);
    // haiku is missing from the second bucket — zero-filled to 0
    expect(out.data).toEqual([
      { bucket: "2026-06-01T00:00:00", "gpt-4o": 1, haiku: 2 },
      { bucket: "2026-06-02T00:00:00", "gpt-4o": 3, haiku: 0 },
    ]);
  });

  it("handles no-breakdown shape (bucket+value)", () => {
    const out = pivotRows(["bucket", "value"], [["2026-06-01", 5]]);
    expect(out.seriesKeys).toEqual(["value"]);
    expect(out.data).toEqual([{ bucket: "2026-06-01", value: 5 }]);
  });

  it("handles categorical [dim, value] shape (no bucket)", () => {
    const out = pivotRows(
      ["service", "value"],
      [
        ["api", 10],
        ["worker", 20],
        ["frontend", 5],
      ],
    );
    expect(out.seriesKeys).toEqual(["api", "worker", "frontend"]);
    expect(out.data).toEqual([
      { name: "api", value: 10 },
      { name: "worker", value: 20 },
      { name: "frontend", value: 5 },
    ]);
  });

  it("treats null dim values as the string 'null' in the bucketed branch", () => {
    const out = pivotRows(
      ["bucket", "model_name", "value"],
      [
        ["2026-06-01T00:00:00", null, 7],
        ["2026-06-01T00:00:00", "haiku", 3],
      ],
    );
    expect(out.seriesKeys).toContain("null");
    expect(out.data[0]).toMatchObject({ null: 7, haiku: 3 });
  });
});
