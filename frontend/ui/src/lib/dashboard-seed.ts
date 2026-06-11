// Widget definitions for the lazily-created default "Overview" dashboard.
// Created once per project on first dashboards fetch, then fully user-owned —
// never re-seeded or force-updated.

type SeedWidget = {
  title: string;
  type: "query" | "trace_feed" | "detector";
  spec: object;
  layout: { x: number; y: number; w: number; h: number };
};

export function defaultDashboardId(projectId: string): string {
  // Deterministic id makes lazy creation idempotent across concurrent requests
  // (second insert fails the PK constraint and is swallowed).
  return `default_${projectId}`;
}

export function seedWidgets(detectorId: string | null): SeedWidget[] {
  const stat = (title: string, spec: object, x: number): SeedWidget => ({
    title,
    type: "query",
    spec,
    layout: { x, y: 0, w: 3, h: 2 },
  });

  const widgets: SeedWidget[] = [
    stat(
      "Requests",
      {
        view: "traces",
        filters: [],
        metric: { measure: "count", agg: "count" },
        breakdown: null,
        display: { type: "number" },
      },
      0,
    ),
    stat(
      "Total cost",
      {
        view: "traces",
        filters: [],
        metric: { measure: "cost", agg: "sum" },
        breakdown: null,
        display: { type: "number" },
      },
      3,
    ),
    stat(
      "Errors",
      {
        view: "traces",
        filters: [],
        metric: { measure: "error_count", agg: "sum" },
        breakdown: null,
        display: { type: "number" },
      },
      6,
    ),
    stat(
      "p95 latency",
      {
        view: "traces",
        filters: [],
        metric: { measure: "duration_ms", agg: "p95" },
        breakdown: null,
        display: { type: "number" },
      },
      9,
    ),
    {
      title: "Cost over time · by model",
      type: "query",
      spec: {
        view: "spans",
        filters: [{ field: "span_kind", op: "=", value: "LLM" }],
        metric: { measure: "cost", agg: "sum" },
        breakdown: "model_name",
        display: { type: "line" },
      },
      layout: { x: 0, y: 2, w: 8, h: 4 },
    },
    {
      title: "Tokens by model",
      type: "query",
      spec: {
        view: "spans",
        filters: [{ field: "span_kind", op: "=", value: "LLM" }],
        metric: { measure: "total_tokens", agg: "sum" },
        breakdown: "model_name",
        display: { type: "bar" },
      },
      layout: { x: 8, y: 2, w: 4, h: 4 },
    },
    {
      title: "Recent traces",
      type: "trace_feed",
      spec: { filters: [], limit: 10 },
      layout: { x: 0, y: 6, w: 12, h: 4 },
    },
  ];

  if (detectorId) {
    widgets.push({
      title: "Detector",
      type: "detector",
      spec: { detectorId },
      layout: { x: 0, y: 10, w: 4, h: 4 },
    });
  }
  return widgets;
}
