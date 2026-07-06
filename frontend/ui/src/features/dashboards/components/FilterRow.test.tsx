// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WidgetSchemaField } from "../types";
import { FilterRow } from "./FilterRow";

vi.mock("../hooks/use-widget-data", () => ({ useWidgetFieldValues: vi.fn() }));
import { useWidgetFieldValues } from "../hooks/use-widget-data";

const stringField: WidgetSchemaField = {
  type: "string",
  label: "Model",
  filterOps: ["=", "!=", "contains"],
  groupable: true,
  aggs: [],
};
const numberField: WidgetSchemaField = {
  type: "number",
  label: "Cost (USD)",
  filterOps: [">", ">=", "<", "<=", "=", "!="],
  groupable: false,
  aggs: ["sum"],
};

const baseProps = {
  index: 0,
  filterableFields: [
    ["model_name", stringField],
    ["cost", numberField],
  ] as [string, WidgetSchemaField][],
  fieldsMap: { model_name: stringField, cost: numberField },
  onChange: vi.fn(),
  onRemove: vi.fn(),
  projectId: "p1",
  view: "spans" as const,
  range: { start: new Date("2026-06-01T00:00:00Z"), end: new Date("2026-06-02T00:00:00Z") },
};

describe("FilterRow value input", () => {
  // RTL auto-cleanup needs vitest globals, which this config doesn't enable.
  afterEach(cleanup);

  it("offers stored values as a dropdown for string equality", () => {
    vi.mocked(useWidgetFieldValues).mockReturnValue({
      values: [{ value: "gpt-4o", count: 3 }],
      isLoading: false,
    });
    render(<FilterRow {...baseProps} filter={{ field: "model_name", op: "=", value: "" }} />);
    // field + op + value selects
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps free text for contains", () => {
    vi.mocked(useWidgetFieldValues).mockReturnValue({ values: [], isLoading: false });
    render(
      <FilterRow {...baseProps} filter={{ field: "model_name", op: "contains", value: "gp" }} />,
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByRole("textbox")).toBeTruthy();
    // the hook is parked while the op is not enumerable
    expect(vi.mocked(useWidgetFieldValues).mock.lastCall?.[4]).toBe(false);
  });

  it("falls back to free text when no stored values exist", () => {
    vi.mocked(useWidgetFieldValues).mockReturnValue({ values: [], isLoading: false });
    render(<FilterRow {...baseProps} filter={{ field: "model_name", op: "=", value: "" }} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("keeps the number input for numeric fields", () => {
    vi.mocked(useWidgetFieldValues).mockReturnValue({ values: [], isLoading: false });
    render(<FilterRow {...baseProps} filter={{ field: "cost", op: ">", value: 5 }} />);
    expect(screen.getByRole("spinbutton")).toBeTruthy();
    expect(vi.mocked(useWidgetFieldValues).mock.lastCall?.[4]).toBe(false);
  });

  it("free-text edits still propagate through onChange", () => {
    vi.mocked(useWidgetFieldValues).mockReturnValue({ values: [], isLoading: false });
    const onChange = vi.fn();
    render(
      <FilterRow
        {...baseProps}
        onChange={onChange}
        filter={{ field: "model_name", op: "contains", value: "" }}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "claude" } });
    expect(onChange).toHaveBeenCalledWith(0, { value: "claude" });
  });
});
