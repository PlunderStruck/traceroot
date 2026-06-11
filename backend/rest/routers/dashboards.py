"""Widget query endpoints for project dashboards.

Dashboard/widget CRUD lives in Next.js API routes (Prisma/Postgres, same as
detectors). This router only executes queries against ClickHouse and exposes
the field registry that drives the builder UI.
"""

import logging

from fastapi import APIRouter, HTTPException, status

from rest.routers.deps import ProjectAccess
from rest.schemas.dashboards import WidgetQueryRequest, WidgetQueryResponse
from rest.services.widget_query import WidgetSpecError, run_widget_query
from rest.services.widget_registry import registry_schema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/widgets", tags=["Dashboards"])


@router.get("/schema")
async def get_widget_schema(project_id: str, _access: ProjectAccess) -> dict:
    """Field registry for the widget builder (views, fields, ops, aggs)."""
    return registry_schema()


@router.post("/query", response_model=WidgetQueryResponse)
async def query_widget_data(
    project_id: str,
    body: WidgetQueryRequest,
    _access: ProjectAccess,
):
    """Execute a widget spec. Stateless: used by saved widgets and builder previews."""
    try:
        return run_widget_query(
            spec=body.spec,
            project_id=project_id,
            start_time=body.start_time,
            end_time=body.end_time,
        )
    except WidgetSpecError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"step": e.step, "message": e.message},
        ) from e
    except Exception as e:
        logger.exception(f"Widget query failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Widget query failed",
        ) from e
