// ABOUTME: Reactive list of past import jobs for the current user.
// ABOUTME: Shows status, progress counts, and relative timestamps for each job.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTimestamp } from "@/lib/date-utils";
import { FileText, CheckCircle2, XCircle, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  uploading: {
    label: "Uploading",
    variant: "secondary" as const,
    icon: Upload,
  },
  parsing: {
    label: "Parsing",
    variant: "secondary" as const,
    icon: Loader2,
  },
  embedding: {
    label: "Embedding",
    variant: "secondary" as const,
    icon: Loader2,
  },
  completed: {
    label: "Complete",
    variant: "default" as const,
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    variant: "destructive" as const,
    icon: XCircle,
  },
} as const;

export function ImportHistory() {
  const jobs = useQuery(api.importJobs.list);

  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Previous Imports
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border">
        {jobs.map((job) => {
          const config = STATUS_CONFIG[job.status];
          const StatusIcon = config.icon;
          const isActive =
            job.status === "parsing" || job.status === "embedding";

          return (
            <div
              key={job._id}
              className="flex items-center gap-3 px-4 py-3 first:rounded-t-lg last:rounded-b-lg"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {job.sourceFilename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {job.totalMessages > 0
                    ? `${job.parsedMessages.toLocaleString()} / ${job.totalMessages.toLocaleString()} messages`
                    : job.parsedMessages > 0
                      ? `${job.parsedMessages.toLocaleString()} messages parsed`
                      : null}
                  {job.skippedDuplicates > 0 &&
                    ` · ${job.skippedDuplicates} skipped`}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={config.variant} className="gap-1 text-xs">
                  <StatusIcon
                    className={cn("h-3 w-3", isActive && "animate-spin")}
                  />
                  {config.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTimestamp(job.startedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
