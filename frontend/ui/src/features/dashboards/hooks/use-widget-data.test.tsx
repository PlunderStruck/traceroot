// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import type { TimeRange } from "../types";
import { useWidgetFieldValues } from "./use-widget-data";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u1", email: "u@example.com" } },
    isPending: false,
  }),
}));
vi.mock("../api");

const RANGE: TimeRange = {
  start: new Date("2026-06-01T00:00:00Z"),
  end: new Date("2026-06-02T00:00:00Z"),
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useWidgetFieldValues", () => {
  beforeEach(() => {
    vi.mocked(api.fetchWidgetFieldValues).mockReset();
  });

  it("fetches stored values once enabled", async () => {
    vi.mocked(api.fetchWidgetFieldValues).mockResolvedValue({
      field: "model_name",
      values: [{ value: "gpt-4o", count: 3 }],
    });
    const { result } = renderHook(
      () => useWidgetFieldValues("p1", "spans", "model_name", RANGE, true),
      { wrapper },
    );
    await waitFor(() => expect(result.current.values).toHaveLength(1));
    expect(result.current.values[0]).toEqual({ value: "gpt-4o", count: 3 });
    expect(api.fetchWidgetFieldValues).toHaveBeenCalledWith("p1", "spans", "model_name", RANGE, {
      id: "u1",
      email: "u@example.com",
    });
  });

  it("stays idle while disabled — no fetch, no values", async () => {
    const { result } = renderHook(
      () => useWidgetFieldValues("p1", "spans", "model_name", RANGE, false),
      { wrapper },
    );
    expect(result.current).toEqual({ values: [], isLoading: false });
    expect(api.fetchWidgetFieldValues).not.toHaveBeenCalled();
  });

  it("stays idle until a field is picked", () => {
    const { result } = renderHook(() => useWidgetFieldValues("p1", "spans", "", RANGE, true), {
      wrapper,
    });
    expect(result.current).toEqual({ values: [], isLoading: false });
    expect(api.fetchWidgetFieldValues).not.toHaveBeenCalled();
  });
});
