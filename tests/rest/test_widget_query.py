"""Tests for widget spec models; SQL compiler tests are added by a later task."""

from datetime import datetime
from typing import get_args

import pytest
from pydantic import ValidationError

from rest.schemas.dashboards import (
    AggName,
    WidgetFilter,
    WidgetQueryRequest,
    WidgetSpec,
)
from rest.services.widget_query import WidgetSpecError, compile_widget_query
from rest.services.widget_registry import (
    AGGS_NUMBER,
    FILTER_OPS_NUMBER,
    FILTER_OPS_STRING,
    REGISTRY,
)


def make_spec(**overrides) -> dict:
    spec = {
        "view": "spans",
        "filters": [{"field": "span_kind", "op": "=", "value": "LLM"}],
        "metric": {"measure": "cost", "agg": "sum"},
        "breakdown": "model_name",
        "display": {"type": "line"},
    }
    spec.update(overrides)
    return spec


def test_valid_spec_parses():
    spec = WidgetSpec.model_validate(make_spec())
    assert spec.view == "spans"
    assert spec.metric.agg == "sum"


def test_unknown_view_rejected():
    with pytest.raises(ValidationError):
        WidgetSpec.model_validate(make_spec(view="secrets"))


def test_unknown_display_rejected():
    with pytest.raises(ValidationError):
        WidgetSpec.model_validate(make_spec(display={"type": "gauge"}))


def test_request_requires_start_and_end_time():
    with pytest.raises(ValidationError):
        WidgetQueryRequest.model_validate({"spec": make_spec()})


# --- Drift-guard tests ---


def test_agg_name_matches_registry():
    """AggName Literal must stay in sync with AGGS_NUMBER plus 'count'."""
    assert set(get_args(AggName)) == set(AGGS_NUMBER) | {"count"}


def test_view_literal_matches_registry():
    """WidgetSpec.view Literal must list exactly the views in REGISTRY."""
    view_annotation = WidgetSpec.model_fields["view"].annotation
    assert set(get_args(view_annotation)) == set(REGISTRY)


def test_filter_op_matches_registry():
    """WidgetFilter.op Literal must cover all string and number filter ops."""
    op_annotation = WidgetFilter.model_fields["op"].annotation
    assert set(get_args(op_annotation)) == set(FILTER_OPS_STRING) | set(FILTER_OPS_NUMBER)


# --- extra="forbid" tests ---


def test_unknown_key_in_spec_rejected():
    """A payload with 'filter' (singular, misspelled) must raise ValidationError."""
    bad_payload = make_spec()
    bad_payload["filter"] = bad_payload.pop("filters")  # misspell the key
    with pytest.raises(ValidationError):
        WidgetSpec.model_validate(bad_payload)


# --- SQL compiler tests ---

START = datetime(2026, 6, 1)
END = datetime(2026, 6, 8)


def compile_(spec_dict):
    spec = WidgetSpec.model_validate(spec_dict)
    return compile_widget_query(spec, project_id="proj-1", start_time=START, end_time=END)


def test_compile_breakdown_bar():
    sql, params = compile_(make_spec(display={"type": "bar"}))
    assert "GROUP BY model_name" in sql
    assert "sum(cost)" in sql
    assert "span_kind = {f0:String}" in sql
    assert params["f0"] == "LLM"
    assert params["project_id"] == "proj-1"
    # top-N cap with remainder folded into "other"
    assert "LIMIT 50" in sql


def test_compile_timeseries_adds_bucket():
    sql, params = compile_(make_spec(display={"type": "line"}))
    # 7-day range → day buckets in UTC
    assert "toStartOfDay(event_time, 'UTC')" in sql
    assert params["start_time"] == START


def test_compile_hour_bucket_for_short_range():
    spec = WidgetSpec.model_validate(make_spec(display={"type": "line"}))
    sql, _ = compile_widget_query(
        spec, project_id="p", start_time=datetime(2026, 6, 1), end_time=datetime(2026, 6, 2)
    )
    assert "toStartOfHour(event_time, 'UTC')" in sql


def test_compile_number_no_groupby():
    sql, _ = compile_(make_spec(display={"type": "number"}, breakdown=None))
    assert "GROUP BY" not in sql


def test_compile_histogram():
    spec = make_spec(display={"type": "histogram"}, breakdown=None)
    spec["metric"] = {"measure": "duration_ms", "agg": "avg"}  # agg ignored for histogram
    sql, _ = compile_(spec)
    assert "histogram(20)(toFloat64(duration_ms))" in sql


def test_compile_traces_view_uses_span_agg():
    spec = make_spec(view="traces", filters=[], breakdown="user_id")
    spec["metric"] = {"measure": "error_count", "agg": "sum"}
    spec["display"] = {"type": "bar"}
    sql, _ = compile_(spec)
    assert "countIf(status = 'ERROR')" in sql  # from the traces base relation
    assert "GROUP BY user_id" in sql


def test_unknown_field_raises_with_step():
    with pytest.raises(WidgetSpecError) as e:
        compile_(make_spec(filters=[{"field": "password", "op": "=", "value": "x"}]))
    assert e.value.step == "filters"


def test_disallowed_agg_raises():
    spec = make_spec()
    spec["metric"] = {"measure": "model_name", "agg": "sum"}  # string field
    with pytest.raises(WidgetSpecError) as e:
        compile_(spec)
    assert e.value.step == "metric"


def test_non_groupable_breakdown_raises():
    with pytest.raises(WidgetSpecError) as e:
        compile_(make_spec(breakdown="cost"))
    assert e.value.step == "breakdown"


def test_disallowed_op_for_type_raises():
    with pytest.raises(WidgetSpecError) as e:
        compile_(make_spec(filters=[{"field": "name", "op": ">", "value": "x"}]))
    assert e.value.step == "filters"


# --- New tests for items 8-10 ---


def test_histogram_cost_contains_tofloat64():
    """cost is Decimal in ClickHouse; histogram() must receive toFloat64(cost)."""
    spec = make_spec(display={"type": "histogram"}, breakdown=None)
    spec["metric"] = {"measure": "cost", "agg": "sum"}
    sql, _ = compile_(spec)
    assert "toFloat64" in sql
    assert "toFloat64(cost)" in sql


def test_histogram_with_breakdown_raises():
    """Histogram does not support a breakdown dimension."""
    spec = make_spec(display={"type": "histogram"}, breakdown="model_name")
    spec["metric"] = {"measure": "cost", "agg": "sum"}
    with pytest.raises(WidgetSpecError) as e:
        compile_(spec)
    assert e.value.step == "breakdown"


def test_non_numeric_filter_value_raises():
    """A string value on a number-typed filter field must raise step='filters'."""
    filters = [{"field": "cost", "op": ">", "value": "not-a-number"}]
    with pytest.raises(WidgetSpecError) as e:
        compile_(make_spec(filters=filters, breakdown=None))
    assert e.value.step == "filters"


def test_long_range_row_cap():
    """A 366-day line+breakdown window should produce LIMIT >= 366*51."""
    spec = WidgetSpec.model_validate(make_spec(display={"type": "line"}))
    start = datetime(2026, 1, 1)
    end = datetime(2027, 1, 2)  # 366 days
    sql, _ = compile_widget_query(spec, project_id="p", start_time=start, end_time=end)
    # Extract the final LIMIT clause (the outermost row cap, not LIMIT 1 BY inside base SQL)
    import re

    matches = re.findall(r"LIMIT (\d+)(?! BY)", sql)
    assert matches, "No outermost LIMIT found in SQL"
    assert int(matches[-1]) >= 366 * 51


def test_breakdown_timeseries_order_by():
    """When breakdown and timeseries are both present, ORDER BY must include both bucket and breakdown."""
    sql, _ = compile_(make_spec(display={"type": "line"}))
    assert "GROUP BY bucket, model_name" in sql
    assert "ORDER BY bucket, model_name" in sql


def test_other_fold_shape():
    """The 'other' fold uses a subquery with LIMIT 50 (MAX_GROUPS)."""
    sql, _ = compile_(make_spec(display={"type": "bar"}))
    assert "'other'" in sql
    assert "IN (SELECT" in sql
    assert "LIMIT 50" in sql


def test_count_measure_with_breakdown():
    """count measure (expr='*') must compile with count(*) and a breakdown."""
    spec = make_spec(display={"type": "bar"})
    spec["metric"] = {"measure": "count", "agg": "count"}
    sql, _ = compile_(spec)
    assert "count(*)" in sql
    assert "GROUP BY model_name" in sql
