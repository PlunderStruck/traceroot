// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardDetail, Widget } from "../types";
import { WidgetBuilderPage } from "./WidgetBuilderPage";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const createWidget = { mutate: vi.fn(), isPending: false, error: null };
const updateWidget = { mutate: vi.fn(), isPending: false, error: null };
vi.mock("../hooks/use-dashboards", () => ({
  useDashboard: vi.fn(),
  useDashboardMutations: () => ({ createWidget, updateWidget }),
}));
vi.mock("../hooks/use-widget-data", () => ({
  useWidgetSchema: () => ({ data: SCHEMA }),
  useWidgetPreview: () => ({ isPending: false, error: null, data: undefined }),
  useWidgetFieldValues: () => ({ values: [], isLoading: false }),
}));
import { useDashboard } from "../hooks/use-dashboards";

const SCHEMA = {
  spans: {
    fields: {
      model_name: {
        type: "string",
        label: "Model",
        filterOps: ["=", "!=", "contains"],
        groupable: true,
        aggs: [],
      },
      cost: {
        type: "number",
        label: "Cost",
        filterOps: [">", ">="],
        groupable: false,
        aggs: ["sum", "avg"],
      },
      count: { type: "number", label: "Count", filterOps: [], groupable: false, aggs: ["count"] },
    },
  },
  traces: { fields: {} },
};

const WIDGET: Widget = {
  id: "w1",
  dashboardId: "d1",
  title: "My cost widget",
  type: "query",
  spec: {
    view: "spans",
    filters: [],
    metric: { measure: "cost", agg: "sum" },
    breakdown: null,
    display: { type: "number" },
  },
  displayConfig: {},
};

const DASHBOARD = {
  id: "d1",
  name: "Overview",
  description: null,
  isDefault: true,
  updateTime: "",
  layout: [],
  widgets: [WIDGET],
} as DashboardDetail;

function mockDashboard(data: DashboardDetail | undefined, error: unknown = null) {
  vi.mocked(useDashboard).mockReturnValue({ data, error } as ReturnType<typeof useDashboard>);
}

describe("WidgetBuilderPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    createWidget.mutate.mockReset();
    updateWidget.mutate.mockReset();
    mockDashboard(DASHBOARD);
  });

  it("renders the two config sections with save disabled on a fresh draft", () => {
    render(<WidgetBuilderPage projectId="p1" dashboardId="d1" />);
    expect(screen.getByText("Data selection")).toBeTruthy();
    expect(screen.getByText("Visualization")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save widget" })).toHaveProperty("disabled", true);
  });

  it("links back to the dashboard by name", () => {
    render(<WidgetBuilderPage projectId="p1" dashboardId="d1" />);
    const back = screen.getByRole("link", { name: /Overview/ });
    expect(back.getAttribute("href")).toBe("/projects/p1/dashboard/d1");
  });

  it("hydrates the form from the widget in edit mode and saves via update", () => {
    render(<WidgetBuilderPage projectId="p1" dashboardId="d1" widgetId="w1" />);
    const name = screen.getByPlaceholderText("Widget name") as HTMLInputElement;
    expect(name.value).toBe("My cost widget");

    const save = screen.getByRole("button", { name: "Save widget" });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);

    expect(updateWidget.mutate).toHaveBeenCalledTimes(1);
    const [payload, options] = updateWidget.mutate.mock.calls[0];
    expect(payload).toMatchObject({ widgetId: "w1", title: "My cost widget" });
    options.onSuccess();
    expect(push).toHaveBeenCalledWith("/projects/p1/dashboard/d1");
  });

  it("keeps a manually edited name (lock) in edit mode", () => {
    render(<WidgetBuilderPage projectId="p1" dashboardId="d1" widgetId="w1" />);
    const name = screen.getByPlaceholderText("Widget name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Renamed" } });
    expect(name.value).toBe("Renamed");
    fireEvent.click(screen.getByRole("button", { name: "Save widget" }));
    expect(updateWidget.mutate.mock.calls[0][0]).toMatchObject({ title: "Renamed" });
  });

  it("redirects to the dashboard when the widget is missing or not a query widget", () => {
    render(<WidgetBuilderPage projectId="p1" dashboardId="d1" widgetId="nope" />);
    expect(replace).toHaveBeenCalledWith("/projects/p1/dashboard/d1");
  });

  it("redirects to the dashboard index when the dashboard failed to load", () => {
    mockDashboard(undefined, new Error("404"));
    render(<WidgetBuilderPage projectId="p1" dashboardId="d1" />);
    expect(replace).toHaveBeenCalledWith("/projects/p1/dashboard");
  });
});
