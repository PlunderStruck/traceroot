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
