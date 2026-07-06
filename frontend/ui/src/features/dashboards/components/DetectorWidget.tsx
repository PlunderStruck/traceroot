"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { Detector } from "@/features/detectors/hooks/use-detectors";
import type { RunsResponse } from "@/features/detectors/hooks/use-findings";

interface DetectorWidgetProps {
  projectId: string;
  spec: { detectorId: string };
}

async function fetchDetector(
  projectId: string,
  detectorId: string,
): Promise<{ detector: Detector } | null> {
  const res = await fetch(`/api/projects/${projectId}/detectors/${detectorId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch detector: ${res.status}`);
  return res.json() as Promise<{ detector: Detector }>;
}

async function fetchFindings(projectId: string, detectorId: string): Promise<RunsResponse> {
  // Findings are triggered runs; the runs endpoint filters them via `identified`.
  const res = await fetch(
    `/api/projects/${projectId}/detectors/${detectorId}/runs?identified=true&limit=1`,
  );
  if (!res.ok) throw new Error(`Failed to fetch findings: ${res.status}`);
  return res.json() as Promise<RunsResponse>;
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DetectorWidget({ projectId, spec }: DetectorWidgetProps) {
  const { detectorId } = spec;

  const {
    data: detectorResult,
    isLoading: detectorLoading,
    isError: detectorError,
  } = useQuery({
    queryKey: ["detector-widget", projectId, detectorId],
    queryFn: () => fetchDetector(projectId, detectorId),
    enabled: !!projectId && !!detectorId,
    retry: 1,
  });

  // null means 404 — detector was deleted
  const detectorDeleted = detectorResult === null;
  const detector = detectorResult?.detector ?? null;

  const { data: findingsData, isLoading: findingsLoading } = useQuery({
    queryKey: ["detector-widget-findings", projectId, detectorId],
    queryFn: () => fetchFindings(projectId, detectorId),
    enabled: !!projectId && !!detectorId && !detectorDeleted && !detectorLoading && !!detector,
  });

  if (detectorLoading) {
    return <p className="text-[11.5px] text-muted-foreground">Loading…</p>;
  }

  if (detectorDeleted) {
    return (
      <p className="text-[11.5px] text-muted-foreground">Detector deleted — remove this widget</p>
    );
  }

  if (detectorError) {
    return <p className="text-[11.5px] text-red-500">Failed to load detector</p>;
  }

  const total = findingsData?.meta.total;
  const lastFinding = findingsData?.data[0];

  return (
    <div className="flex h-full flex-col gap-3">
      {detector && <p className="text-[11.5px] font-medium text-foreground">{detector.name}</p>}

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
          {total != null ? total : "—"}
        </span>
        <span className="text-[11.5px] text-muted-foreground">findings</span>
      </div>

      {lastFinding && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="text-muted-foreground">Last:</span>
          <span>{fmtTimestamp(lastFinding.timestamp)}</span>
        </div>
      )}

      <Link
        href={`/projects/${projectId}/detectors`}
        className="mt-auto inline-flex items-center gap-1 text-[11.5px] text-amber-700 hover:underline dark:text-amber-300"
      >
        View findings →
      </Link>
    </div>
  );
}
