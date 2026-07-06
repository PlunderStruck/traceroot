import { describe, expect, it, vi } from "vitest";
import { fetchTraceApi } from "@/lib/api/client";
import { fetchWidgetFieldValues } from "./api";

vi.mock("@/lib/api/client", () => ({
  fetchNextApi: vi.fn(),
  fetchTraceApi: vi.fn().mockResolvedValue({ field: "model_name", values: [] }),
}));

describe("fetchWidgetFieldValues", () => {
  it("hits the widgets field-values route with the window bounds", async () => {
    const range = {
      start: new Date("2026-06-01T00:00:00Z"),
      end: new Date("2026-06-02T00:00:00Z"),
    };
    await fetchWidgetFieldValues("p1", "spans", "model_name", range, {
      id: "u1",
      email: "u@example.com",
    });
    const [path, , user] = vi.mocked(fetchTraceApi).mock.calls[0];
    expect(path).toBe(
      "/projects/p1/widgets/field-values/spans/model_name" +
        "?start_time=2026-06-01T00%3A00%3A00.000Z&end_time=2026-06-02T00%3A00%3A00.000Z",
    );
    expect(user).toEqual({ id: "u1", email: "u@example.com" });
  });
});
