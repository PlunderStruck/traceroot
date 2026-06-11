import { NextRequest } from "next/server";
import { prisma } from "@traceroot/core";
import {
  requireAuth,
  requireProjectAccess,
  errorResponse,
  successResponse,
} from "@/lib/auth-helpers";
import { defaultDashboardId, seedWidgets } from "@/lib/dashboard-seed";

type RouteParams = { params: Promise<{ projectId: string }> };

const listArgs = (projectId: string) => ({
  where: { projectId },
  orderBy: [{ isDefault: "desc" as const }, { createTime: "asc" as const }],
  select: { id: true, name: true, description: true, isDefault: true, updateTime: true },
});

// GET /api/projects/[projectId]/dashboards — list; lazily seeds the default
// "Overview" dashboard the first time a project's dashboards are fetched.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const { projectId } = await params;
  const accessResult = await requireProjectAccess(user.id, projectId);
  if (accessResult.error) return accessResult.error;

  let dashboards = await prisma.dashboard.findMany(listArgs(projectId));

  if (dashboards.length === 0) {
    const detector = await prisma.detector.findFirst({
      where: { projectId },
      orderBy: { createTime: "desc" },
      select: { id: true },
    });
    const widgets = seedWidgets(detector?.id ?? null);
    try {
      await prisma.dashboard.create({
        data: {
          id: defaultDashboardId(projectId),
          projectId,
          name: "Overview",
          isDefault: true,
          createdBy: user.id,
          // layout keys MUST equal widget ids (react-grid-layout matches on `i`)
          layout: widgets.map((w, i) => ({ i: `seed-${i}-${projectId}`, ...w.layout })),
          widgets: {
            create: widgets.map((w, i) => ({
              id: `seed-${i}-${projectId}`,
              title: w.title,
              type: w.type,
              spec: w.spec,
            })),
          },
        },
      });
    } catch {
      // Concurrent first-visit: another request already created it (PK clash).
    }
    dashboards = await prisma.dashboard.findMany(listArgs(projectId));
  }

  return successResponse({ data: dashboards });
}

// POST /api/projects/[projectId]/dashboards — create a named dashboard
export async function POST(req: NextRequest, { params }: RouteParams) {
  const authResult = await requireAuth();
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  const { projectId } = await params;
  const accessResult = await requireProjectAccess(user.id, projectId);
  if (accessResult.error) return accessResult.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }
  const { name, description } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) {
    return errorResponse("name must be a non-empty string", 400);
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return errorResponse("description must be a string", 400);
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      projectId,
      name: name.trim(),
      description: (description as string) ?? null,
      createdBy: user.id,
    },
  });
  return successResponse({ dashboard }, 201);
}
