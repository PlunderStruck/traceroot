"""Tests for widget spec models; SQL compiler tests are added by a later task."""

from typing import get_args

import pytest
from pydantic import ValidationError

from rest.schemas.dashboards import (
    AggName,
    WidgetFilter,
    WidgetQueryRequest,
    WidgetSpec,
)
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

from datetime import datetime  # noqa: E402

try:
    from rest.services.widget_query import WidgetSpecError, compile_widget_query
except ModuleNotFoundError:
    compile_widget_query = None  # type: ignore[assignment]
    WidgetSpecError = None  # type: ignore[assignment]

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
    # 7-day range → day buckets
    assert "toStartOfDay(event_time)" in sql
    assert params["start_time"] == START


def test_compile_hour_bucket_for_short_range():
    spec = WidgetSpec.model_validate(make_spec(display={"type": "line"}))
    sql, _ = compile_widget_query(
        spec, project_id="p", start_time=datetime(2026, 6, 1), end_time=datetime(2026, 6, 2)
    )
    assert "toStartOfHour(event_time)" in sql


def test_compile_number_no_groupby():
    sql, _ = compile_(make_spec(display={"type": "number"}, breakdown=None))
    assert "GROUP BY" not in sql


def test_compile_histogram():
    spec = make_spec(display={"type": "histogram"}, breakdown=None)
    spec["metric"] = {"measure": "duration_ms", "agg": "avg"}  # agg ignored for histogram
    sql, _ = compile_(spec)
    assert "histogram(20)(duration_ms)" in sql


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
