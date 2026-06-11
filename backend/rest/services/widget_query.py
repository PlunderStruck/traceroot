"""Compile validated widget specs into parameterized ClickHouse SQL.

Security model: field names resolve through the static registry to fixed SQL
expressions; every user value binds as a ClickHouse parameter. User strings
never appear in SQL text, so injection is structurally impossible.
"""

from datetime import datetime, timedelta
from typing import Any

from db.clickhouse import get_clickhouse_client
from rest.schemas.dashboards import WidgetSpec
from rest.services.widget_registry import REGISTRY, FieldDef

MAX_GROUPS = 50  # top-N breakdown groups; remainder folds into "other"
MAX_TABLE_ROWS = 1000
HISTOGRAM_BINS = 20
QUERY_TIMEOUT_S = 10
HOUR_BUCKET_MAX = timedelta(days=2)

_AGG_SQL = {
    "count": "count({expr})",
    "sum": "sum({expr})",
    "avg": "avg({expr})",
    "min": "min({expr})",
    "max": "max({expr})",
    "p50": "quantile(0.5)({expr})",
    "p95": "quantile(0.95)({expr})",
    "p99": "quantile(0.99)({expr})",
}

_OP_SQL = {
    "=": "{expr} = {{{p}:{t}}}",
    "!=": "{expr} != {{{p}:{t}}}",
    ">": "{expr} > {{{p}:{t}}}",
    ">=": "{expr} >= {{{p}:{t}}}",
    "<": "{expr} < {{{p}:{t}}}",
    "<=": "{expr} <= {{{p}:{t}}}",
    "contains": "{expr} ILIKE {{{p}:String}}",
}


class WidgetSpecError(Exception):
    """Spec failed registry validation. `step` names the builder step at fault."""

    def __init__(self, step: str, message: str):
        self.step = step
        self.message = message
        super().__init__(f"{step}: {message}")


def _resolve_field(view_fields: dict[str, FieldDef], name: str, step: str) -> FieldDef:
    f = view_fields.get(name)
    if f is None:
        raise WidgetSpecError(step, f"Unknown field '{name}'. Allowed: {sorted(view_fields)}")
    return f


def _pick_granularity(start_time: datetime, end_time: datetime) -> str:
    return "hour" if end_time - start_time <= HOUR_BUCKET_MAX else "day"


def compile_widget_query(
    spec: WidgetSpec,
    project_id: str,
    start_time: datetime,
    end_time: datetime,
) -> tuple[str, dict[str, Any]]:
    """Return (sql, params) for the spec. Raises WidgetSpecError on bad specs."""
    view = REGISTRY[spec.view]
    params: dict[str, Any] = {
        "project_id": project_id,
        "start_time": start_time,
        "end_time": end_time,
    }

    # --- filters ---
    conditions: list[str] = []
    for i, flt in enumerate(spec.filters):
        f = _resolve_field(view.fields, flt.field, "filters")
        if flt.op not in f.filter_ops:
            raise WidgetSpecError(
                "filters",
                f"Op '{flt.op}' not allowed for '{flt.field}'. Allowed: {list(f.filter_ops)}",
            )
        pname = f"f{i}"
        ch_type = "String" if f.type == "string" else "Float64"
        conditions.append(_OP_SQL[flt.op].format(expr=f.expr, p=pname, t=ch_type))
        params[pname] = f"%{flt.value}%" if flt.op == "contains" else flt.value
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    base = f"({view.base_sql})"

    # --- histogram compiles to its own shape ---
    if spec.display.type == "histogram":
        measure = _resolve_field(view.fields, spec.metric.measure, "metric")
        if measure.type != "number" or measure.expr == "*":
            raise WidgetSpecError("metric", f"'{spec.metric.measure}' cannot be histogrammed")
        sql = (
            f"SELECT tupleElement(b, 1) AS lo, tupleElement(b, 2) AS hi, tupleElement(b, 3) AS height "
            f"FROM (SELECT arrayJoin(histogram({HISTOGRAM_BINS})({measure.expr})) AS b "
            f"FROM {base} {where})"
        )
        return sql, params

    # --- metric ---
    measure = _resolve_field(view.fields, spec.metric.measure, "metric")
    if spec.metric.agg not in measure.aggs:
        raise WidgetSpecError(
            "metric",
            f"Agg '{spec.metric.agg}' not allowed for '{spec.metric.measure}'."
            f" Allowed: {list(measure.aggs)}",
        )
    metric_sql = _AGG_SQL[spec.metric.agg].format(expr=measure.expr)

    # --- dimensions: optional time bucket + optional breakdown ---
    select_cols: list[str] = []
    group_cols: list[str] = []
    order_by = ""

    is_timeseries = spec.display.type in ("line", "area")
    if is_timeseries:
        gran = _pick_granularity(start_time, end_time)
        bucket_fn = "toStartOfHour" if gran == "hour" else "toStartOfDay"
        select_cols.append(f"{bucket_fn}(event_time) AS bucket")
        group_cols.append("bucket")
        order_by = "ORDER BY bucket"

    if spec.breakdown is not None:
        bd = _resolve_field(view.fields, spec.breakdown, "breakdown")
        if not bd.groupable:
            raise WidgetSpecError("breakdown", f"'{spec.breakdown}' is not groupable")
        # Top-N guard: keep the MAX_GROUPS largest groups, fold the rest into
        # 'other' so a high-cardinality breakdown can't return unbounded rows.
        select_cols.append(
            f"if({bd.expr} IN (SELECT {bd.expr} FROM {base} {where} "
            f"GROUP BY {bd.expr} ORDER BY {metric_sql} DESC LIMIT {MAX_GROUPS}), "
            f"toString({bd.expr}), 'other') AS {spec.breakdown}"
        )
        group_cols.append(spec.breakdown)
        if not order_by:
            order_by = "ORDER BY value DESC"

    select_cols.append(f"{metric_sql} AS value")
    group_by = f"GROUP BY {', '.join(group_cols)}" if group_cols else ""
    limit = f"LIMIT {MAX_TABLE_ROWS if spec.display.type == 'table' else MAX_GROUPS * 200}"

    sql = f"SELECT {', '.join(select_cols)} FROM {base} {where} {group_by} {order_by} {limit}"
    return sql, params


def run_widget_query(
    spec: WidgetSpec, project_id: str, start_time: datetime, end_time: datetime
) -> dict[str, Any]:
    """Compile and execute, returning the response contract dict."""
    sql, params = compile_widget_query(spec, project_id, start_time, end_time)
    client = get_clickhouse_client()
    result = client.query(
        sql,
        parameters=params,
        settings={"readonly": 1, "max_execution_time": QUERY_TIMEOUT_S},
    )
    meta: dict[str, Any] = {}
    if spec.display.type in ("line", "area"):
        meta["granularity"] = _pick_granularity(start_time, end_time)
    return {
        "columns": list(result.column_names),
        "rows": [list(r) for r in result.result_rows],
        "meta": meta,
    }
