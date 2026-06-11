"""Tests for the widget field registry."""

from rest.services.widget_registry import REGISTRY, registry_schema


def test_views_exist():
    assert set(REGISTRY.keys()) == {"spans", "traces"}


def test_spans_fields():
    spans = REGISTRY["spans"]
    # dimensions
    for f in ["name", "span_kind", "status", "model_name", "environment"]:
        assert spans.fields[f].groupable, f
        assert "=" in spans.fields[f].filter_ops, f
    # measures
    for f in ["cost", "input_tokens", "output_tokens", "total_tokens", "duration_ms"]:
        assert spans.fields[f].aggs, f
    assert spans.fields["count"].aggs == ("count",)


def test_traces_fields():
    traces = REGISTRY["traces"]
    for f in ["name", "user_id", "session_id", "environment"]:
        assert traces.fields[f].groupable, f
    for f in ["cost", "total_tokens", "error_count", "duration_ms"]:
        assert traces.fields[f].aggs, f


def test_schema_serialization_is_json_friendly():
    schema = registry_schema()
    assert set(schema.keys()) == {"spans", "traces"}
    spans_cost = schema["spans"]["fields"]["cost"]
    assert spans_cost["type"] == "number"
    assert "sum" in spans_cost["aggs"]
    # exprs are an implementation detail — never exposed to clients
    assert "expr" not in spans_cost
