import { z } from "zod";

export const DISPLAY_TYPES = [
  "line",
  "area",
  "bar",
  "pie",
  "number",
  "table",
  "histogram",
] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];

export const AGGS = ["count", "sum", "avg", "min", "max", "p50", "p95", "p99"] as const;

export const WidgetFilterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["=", "!=", "contains", ">", ">=", "<", "<="]),
  value: z.union([z.string(), z.number()]),
});

export const WidgetSpecSchema = z.object({
  view: z.enum(["spans", "traces"]),
  filters: z.array(WidgetFilterSchema).default([]),
  metric: z.object({ measure: z.string().min(1), agg: z.enum(AGGS) }),
  breakdown: z.string().nullable().default(null),
  display: z.object({ type: z.enum(DISPLAY_TYPES) }),
});
export type WidgetSpec = z.infer<typeof WidgetSpecSchema>;

// Partial spec held by the builder while the user fills steps.
export type DraftSpec = Partial<Omit<WidgetSpec, "metric" | "display">> & {
  metric?: Partial<WidgetSpec["metric"]>;
  display?: Partial<WidgetSpec["display"]>;
};

export function isSpecComplete(draft: unknown): draft is WidgetSpec {
  return WidgetSpecSchema.safeParse(draft).success;
}

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  updateTime: string;
}

export interface LayoutItem {
  i: string; // widget id
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Widget {
  id: string;
  dashboardId: string;
  title: string;
  type: "query" | "detector" | "trace_feed";
  spec: Record<string, unknown>;
  displayConfig: Record<string, unknown>;
}

export interface DashboardDetail extends DashboardSummary {
  layout: LayoutItem[];
  widgets: Widget[];
}

export interface WidgetQueryResult {
  columns: string[];
  rows: (string | number | null)[][];
  meta: { granularity?: "hour" | "day" };
}

export interface WidgetSchemaField {
  type: "string" | "number";
  label: string;
  filterOps: string[];
  groupable: boolean;
  aggs: string[];
}

export type WidgetSchema = Record<
  "spans" | "traces",
  { fields: Record<string, WidgetSchemaField> }
>;

export interface TimeRange {
  start: Date;
  end: Date;
}
