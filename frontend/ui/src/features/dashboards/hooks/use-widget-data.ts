import { useQuery } from "@tanstack/react-query";
import { useSession as useAuthSession } from "@/lib/auth-client";
import type { TraceApiUser } from "@/lib/api/client";
import * as api from "../api";
import { isSpecComplete, type TimeRange, type WidgetSpec } from "../types";

export function useWidgetSchema(projectId: string) {
  const { data: authSession, isPending } = useAuthSession();
  const sessionReady = !isPending && !!authSession?.user;
  const user: TraceApiUser | undefined = authSession?.user
    ? { id: authSession.user.id, email: authSession.user.email }
    : undefined;

  return useQuery({
    queryKey: ["widget-schema", projectId],
    queryFn: () => api.fetchWidgetSchema(projectId, user),
    enabled: sessionReady && !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWidgetData(
  projectId: string,
  widgetId: string,
  spec: WidgetSpec,
  range: TimeRange,
  live: boolean,
) {
  const { data: authSession, isPending } = useAuthSession();
  const sessionReady = !isPending && !!authSession?.user;
  const user: TraceApiUser | undefined = authSession?.user
    ? { id: authSession.user.id, email: authSession.user.email }
    : undefined;

  return useQuery({
    queryKey: [
      "widget-data",
      projectId,
      widgetId,
      JSON.stringify(spec),
      range.start.getTime(),
      range.end.getTime(),
    ],
    queryFn: () => api.runWidgetQuery(projectId, spec, range, user),
    enabled: sessionReady && !!projectId && !!widgetId,
    refetchInterval: live ? 30_000 : false,
    retry: 1,
  });
}

export function useWidgetPreview(projectId: string, draft: unknown, range: TimeRange) {
  const { data: authSession, isPending } = useAuthSession();
  const sessionReady = !isPending && !!authSession?.user;
  const user: TraceApiUser | undefined = authSession?.user
    ? { id: authSession.user.id, email: authSession.user.email }
    : undefined;

  return useQuery({
    queryKey: ["widget-preview", projectId, JSON.stringify(draft)],
    queryFn: () => api.runWidgetQuery(projectId, draft as WidgetSpec, range, user),
    enabled: sessionReady && isSpecComplete(draft),
    staleTime: 10_000,
    retry: false,
  });
}
