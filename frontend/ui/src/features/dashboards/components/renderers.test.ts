import { describe, expect, it } from "vitest";
import { pivotRows } from "./renderers";

describe("pivotRows", () => {
  it("pivots bucket+breakdown rows into one series per breakdown value", () => {
    const out = pivotRows(
      ["bucket", "model_name", "value"],
      [
        ["2026-06-01T00:00:00", "gpt-4o", 1],
        ["2026-06-01T00:00:00", "haiku", 2],
        ["2026-06-02T00:00:00", "gpt-4o", 3],
      ],
    );
    expect(out.seriesKeys).toEqual(["gpt-4o", "haiku"]);
    expect(out.data).toEqual([
      { bucket: "2026-06-01T00:00:00", "gpt-4o": 1, haiku: 2 },
      { bucket: "2026-06-02T00:00:00", "gpt-4o": 3 },
    ]);
  });

  it("handles no-breakdown shape (bucket+value)", () => {
    const out = pivotRows(["bucket", "value"], [["2026-06-01", 5]]);
    expect(out.seriesKeys).toEqual(["value"]);
    expect(out.data).toEqual([{ bucket: "2026-06-01", value: 5 }]);
  });
});
