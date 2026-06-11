"""Request/response models for the widget query engine."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

DisplayType = Literal["line", "area", "bar", "pie", "number", "table", "histogram"]
AggName = Literal["count", "sum", "avg", "min", "max", "p50", "p95", "p99"]


class WidgetFilter(BaseModel):
    field: str
    op: Literal["=", "!=", "contains", ">", ">=", "<", "<="]
    value: str | float


class WidgetMetric(BaseModel):
    measure: str
    agg: AggName


class WidgetDisplay(BaseModel):
    type: DisplayType


class WidgetSpec(BaseModel):
    view: Literal["spans", "traces"]
    filters: list[WidgetFilter] = Field(default_factory=list)
    metric: WidgetMetric
    breakdown: str | None = None
    display: WidgetDisplay


class WidgetQueryRequest(BaseModel):
    spec: WidgetSpec
    start_time: datetime
    end_time: datetime


class WidgetQueryResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    meta: dict[str, Any] = Field(default_factory=dict)
