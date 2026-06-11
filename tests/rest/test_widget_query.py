"""Tests for widget spec models and the SQL compiler."""

import pytest
from pydantic import ValidationError

from rest.schemas.dashboards import WidgetQueryRequest, WidgetSpec


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


def test_request_requires_time_range():
    with pytest.raises(ValidationError):
        WidgetQueryRequest.model_validate({"spec": make_spec()})
