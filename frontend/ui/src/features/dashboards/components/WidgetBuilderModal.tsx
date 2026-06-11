"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DISPLAY_TYPES,
  isSpecComplete,
  parseSpec,
  type DraftSpec,
  type TimeRange,
  type Widget,
  type WidgetSchemaField,
} from "../types";
import { useWidgetPreview, useWidgetSchema } from "../hooks/use-widget-data";
import { QueryWidgetRenderer } from "./renderers";

// ── small hook ───────────────────────────────────────────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const NONE_SENTINEL = "__none__";

type View = "spans" | "traces";

const EMPTY_DRAFT: DraftSpec = { filters: [], breakdown: null };

// ── filter row ────────────────────────────────────────────────────────────────

function FilterRow({
  index,
  filter,
  filterableFields,
  fieldsMap,
  onChange,
  onRemove,
}: {
  index: number;
  filter: { field: string; op: string; value: string | number };
  filterableFields: [string, WidgetSchemaField][];
  fieldsMap: Record<string, WidgetSchemaField>;
  onChange: (idx: number, patch: Partial<typeof filter>) => void;
  onRemove: (idx: number) => void;
}) {
  const fieldMeta = fieldsMap[filter.field];
  const ops = fieldMeta?.filterOps ?? [];
  const isNumeric = fieldMeta?.type === "number";

  return (
    <div className="flex items-center gap-1.5">
      {/* field */}
      <Select
        value={filter.field || undefined}
        onValueChange={(v) => onChange(index, { field: v, op: "", value: "" })}
      >
        <SelectTrigger className="h-7 flex-1 text-[12px]">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent>
          {filterableFields.map(([key, meta]) => (
            <SelectItem key={key} value={key} className="text-[12px]">
              {meta.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* op */}
      <Select
        value={filter.op || undefined}
        onValueChange={(v) => onChange(index, { op: v })}
        disabled={!filter.field}
      >
        <SelectTrigger className="h-7 w-24 text-[12px]">
          <SelectValue placeholder="Op" />
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op} className="text-[12px]">
              {op}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* value */}
      <Input
        className="h-7 flex-1 text-[12px]"
        placeholder="Value"
        type={isNumeric ? "number" : "text"}
        value={String(filter.value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(index, { value: isNumeric && raw !== "" ? Number(raw) : raw });
        }}
        disabled={!filter.field}
      />

      {/* remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Remove filter"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── section label ─────────────────────────────────────────────────────────────

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {n} {children}
    </p>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export interface WidgetBuilderModalProps {
  projectId: string;
  range: TimeRange;
  open: boolean;
  editing: Widget | null;
  onClose: () => void;
  onSave: (v: { title: string; spec: object }) => void;
}

export function WidgetBuilderModal({
  projectId,
  range,
  open,
  editing,
  onClose,
  onSave,
}: WidgetBuilderModalProps) {
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<DraftSpec>(EMPTY_DRAFT);

  // initialise / reset when modal opens or switches between new/edit
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDraft(editing.spec as DraftSpec);
    } else {
      setTitle("");
      setDraft(EMPTY_DRAFT);
    }
  }, [open, editing]);

  const { data: schema } = useWidgetSchema(projectId);

  const view = draft.view as View | undefined;
  const viewFields: Record<string, WidgetSchemaField> = view ? (schema?.[view]?.fields ?? {}) : {};

  const filterableFields = Object.entries(viewFields).filter(([, f]) => f.filterOps.length > 0) as [
    string,
    WidgetSchemaField,
  ][];

  const measurableFields = Object.entries(viewFields).filter(([, f]) => f.aggs.length > 0) as [
    string,
    WidgetSchemaField,
  ][];

  const groupableFields = Object.entries(viewFields).filter(([, f]) => f.groupable) as [
    string,
    WidgetSchemaField,
  ][];

  // ── view change: reset rest of draft ──────────────────────────────────────
  function handleViewChange(v: View) {
    setDraft({ view: v, filters: [], breakdown: null });
  }

  // ── filters ───────────────────────────────────────────────────────────────
  const filters = draft.filters ?? [];

  // Filter rows use `op: string` while DraftSpec expects the strict op union.
  // Rows are partial/in-progress; parseSpec/isSpecComplete validates the final
  // shape — so we cast through unknown here to satisfy the type checker.
  function handleFilterChange(
    idx: number,
    patch: Partial<{ field: string; op: string; value: string | number }>,
  ) {
    const next = filters.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    setDraft((d) => ({ ...d, filters: next }) as unknown as DraftSpec);
  }

  function handleFilterRemove(idx: number) {
    setDraft(
      (d) => ({ ...d, filters: filters.filter((_, i) => i !== idx) }) as unknown as DraftSpec,
    );
  }

  function handleAddFilter() {
    setDraft(
      (d) =>
        ({ ...d, filters: [...filters, { field: "", op: "", value: "" }] }) as unknown as DraftSpec,
    );
  }

  // ── metric ────────────────────────────────────────────────────────────────
  const measure = draft.metric?.measure ?? "";
  const agg = draft.metric?.agg ?? "";
  const measureMeta = viewFields[measure];
  const allowedAggs = measureMeta?.aggs ?? [];

  function handleMeasureChange(m: string) {
    const firstAgg = viewFields[m]?.aggs[0] ?? "";
    setDraft((d) => ({ ...d, metric: { measure: m, agg: firstAgg } }) as unknown as DraftSpec);
  }

  function handleAggChange(a: string) {
    setDraft(
      (d) =>
        ({ ...d, metric: { measure: d.metric?.measure ?? "", agg: a } }) as unknown as DraftSpec,
    );
  }

  // ── breakdown ─────────────────────────────────────────────────────────────
  function handleBreakdownChange(v: string) {
    setDraft((d) => ({ ...d, breakdown: v === NONE_SENTINEL ? null : v }));
  }

  // ── display ───────────────────────────────────────────────────────────────
  function handleDisplayChange(t: (typeof DISPLAY_TYPES)[number]) {
    setDraft((d) => ({ ...d, display: { type: t } }));
  }

  // ── preview ───────────────────────────────────────────────────────────────
  const debouncedDraft = useDebounced(draft, 400);
  const preview = useWidgetPreview(projectId, debouncedDraft, range);

  const specComplete = isSpecComplete(draft);
  const canSave = specComplete && title.trim().length > 0;

  function handleSave() {
    const spec = parseSpec(draft);
    if (!spec) return;
    onSave({ title: title.trim(), spec });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="flex h-[520px] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-[13.5px] font-semibold">
            {editing ? "Edit widget" : "New widget"}
          </DialogTitle>
        </DialogHeader>

        {/* body: steps left + preview right */}
        <div className="flex min-h-0 flex-1">
          {/* steps column */}
          <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r px-5 py-4">
            {/* title */}
            <div>
              <StepLabel n={0}>Title</StepLabel>
              <Input
                className="h-7 text-[12px]"
                placeholder="Widget title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* 1 view */}
            <div>
              <StepLabel n={1}>View</StepLabel>
              <Select value={view} onValueChange={handleViewChange}>
                <SelectTrigger className="h-7 text-[12px]">
                  <SelectValue placeholder="Select view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="traces" className="text-[12px]">
                    Traces
                  </SelectItem>
                  <SelectItem value="spans" className="text-[12px]">
                    Spans
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 2 filters */}
            <div>
              <StepLabel n={2}>Filters</StepLabel>
              <div className="flex flex-col gap-1.5">
                {filters.map((f, i) => (
                  <FilterRow
                    key={i}
                    index={i}
                    filter={f as { field: string; op: string; value: string | number }}
                    filterableFields={filterableFields}
                    fieldsMap={viewFields}
                    onChange={handleFilterChange}
                    onRemove={handleFilterRemove}
                  />
                ))}
                <button
                  type="button"
                  disabled={!view}
                  onClick={handleAddFilter}
                  className="mt-0.5 self-start text-[11.5px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ＋ Add filter
                </button>
              </div>
            </div>

            {/* 3 metric */}
            <div>
              <StepLabel n={3}>Metric</StepLabel>
              <div className="flex flex-col gap-1.5">
                <Select
                  value={measure || undefined}
                  onValueChange={handleMeasureChange}
                  disabled={!view}
                >
                  <SelectTrigger className="h-7 text-[12px]">
                    <SelectValue placeholder="Measure" />
                  </SelectTrigger>
                  <SelectContent>
                    {measurableFields.map(([key, meta]) => (
                      <SelectItem key={key} value={key} className="text-[12px]">
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={agg || undefined}
                  onValueChange={handleAggChange}
                  disabled={!measure}
                >
                  <SelectTrigger className="h-7 text-[12px]">
                    <SelectValue placeholder="Aggregation" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedAggs.map((a) => (
                      <SelectItem key={a} value={a} className="text-[12px]">
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 4 breakdown */}
            <div>
              <StepLabel n={4}>Breakdown</StepLabel>
              <Select
                value={draft.breakdown ?? NONE_SENTINEL}
                onValueChange={handleBreakdownChange}
                disabled={!view}
              >
                <SelectTrigger className="h-7 text-[12px]">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL} className="text-[12px]">
                    None
                  </SelectItem>
                  {groupableFields.map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="text-[12px]">
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 5 display */}
            <div>
              <StepLabel n={5}>Display</StepLabel>
              <div className="flex flex-wrap gap-1">
                {DISPLAY_TYPES.map((t) => {
                  const selected = draft.display?.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleDisplayChange(t)}
                      className={[
                        "rounded border px-2 py-0.5 text-[11px] transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* preview pane */}
          <div className="flex min-w-0 flex-1 flex-col p-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <div className="min-h-0 flex-1">
              {!specComplete ? (
                <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                  Complete steps 1–5 to preview
                </div>
              ) : preview.isLoading ? (
                <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                  Running…
                </div>
              ) : preview.error ? (
                <div className="flex h-full items-start justify-center pt-8 text-[12px] text-red-600">
                  {preview.error instanceof Error ? preview.error.message : "Query failed"}
                </div>
              ) : preview.data ? (
                <QueryWidgetRenderer display={draft.display!.type!} result={preview.data} />
              ) : null}
            </div>
          </div>
        </div>

        {/* footer */}
        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSave} onClick={handleSave}>
            Save to dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
