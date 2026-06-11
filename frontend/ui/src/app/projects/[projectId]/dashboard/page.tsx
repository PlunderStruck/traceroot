"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDashboards } from "@/features/dashboards/hooks/use-dashboards";

export default function DashboardIndexPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { data: dashboards } = useDashboards(projectId);

  useEffect(() => {
    // The list endpoint lazily seeds the default Overview, so there is always
    // at least one dashboard once the query resolves.
    if (dashboards && dashboards.length > 0) {
      const target = dashboards.find((d) => d.isDefault) ?? dashboards[0];
      router.replace(`/projects/${projectId}/dashboard/${target.id}`);
    }
  }, [dashboards, projectId, router]);

  return (
    <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
      Loading dashboards…
    </div>
  );
}
