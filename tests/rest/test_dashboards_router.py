"""Endpoint tests for the widget query router."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from rest.main import app
from rest.routers.deps import ProjectAccessInfo, get_project_access


@pytest.fixture()
def client():
    app.dependency_overrides[get_project_access] = lambda: ProjectAccessInfo(
        project_id="proj-1", user_id="user-1", role="admin"
    )
    yield TestClient(app)


VALID_BODY = {
    "spec": {
        "view": "spans",
        "filters": [],
        "metric": {"measure": "cost", "agg": "sum"},
        "breakdown": "model_name",
        "display": {"type": "bar"},
    },
    "start_time": "2026-06-01T00:00:00Z",
    "end_time": "2026-06-08T00:00:00Z",
}


def test_schema_endpoint(client):
    resp = client.get("/api/v1/projects/proj-1/widgets/schema")
    assert resp.status_code == 200
    body = resp.json()
    assert "spans" in body and "traces" in body
    assert body["spans"]["fields"]["cost"]["aggs"]


def test_query_endpoint_executes(client):
    fake = {"columns": ["model_name", "value"], "rows": [["gpt-4o", 1.5]], "meta": {}}
    with patch("rest.routers.dashboards.run_widget_query", return_value=fake) as mock_run:
        resp = client.post("/api/v1/projects/proj-1/widgets/query", json=VALID_BODY)
    assert resp.status_code == 200
    assert resp.json() == fake
    # project scoping comes from the path, never the body
    assert mock_run.call_args.kwargs["project_id"] == "proj-1"


def test_query_endpoint_spec_error_is_422_with_step(client):
    bad = {**VALID_BODY, "spec": {**VALID_BODY["spec"], "breakdown": "cost"}}
    resp = client.post("/api/v1/projects/proj-1/widgets/query", json=bad)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["step"] == "breakdown"


def test_query_endpoint_pydantic_error_is_422(client):
    bad = {**VALID_BODY, "spec": {**VALID_BODY["spec"], "display": {"type": "gauge"}}}
    resp = client.post("/api/v1/projects/proj-1/widgets/query", json=bad)
    assert resp.status_code == 422


def test_query_endpoint_no_auth_is_not_200():
    """Without the dependency override, auth is enforced — must not return 200."""
    # Don't override get_project_access — let it run for real.
    # The real auth dep makes an httpx call that fails fast in tests.
    test_client = TestClient(app, raise_server_exceptions=False)
    resp = test_client.post("/api/v1/projects/proj-1/widgets/query", json=VALID_BODY)
    assert resp.status_code in (401, 503)
