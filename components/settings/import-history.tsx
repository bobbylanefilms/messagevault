// ABOUTME: Import history table showing all past import jobs for the current user.
// ABOUTME: Displays status badges, duration, message counts, and links to start new imports.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatRelativeTimestamp } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

function formatDuration(startedAt: number, completedAt?: number): string {
  if (!completedAt) return "—";
  const ms = completedAt - startedAt;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return "< 1m";
  return `${minutes}m ${seconds}s`;
}

function StatusBadge({
  status,
  error,
}: {
  status: string;
  error?: string;
}) {
  if (status === "completed") {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Complete</Badge>;
  }
  if (status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 cursor-help">
            Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          <p>{error ?? "Unknown error"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  // uploading / parsing / embedding
  return (
    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse">
      In Progress
    </Badge>
  );
}

export function ImportHistory() {
  const importJobs = useQuery(api.importJobs.list);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Import History</CardTitle>
        <Button asChild size="sm">
          <Link href="/import">Import</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {importJobs === undefined ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : importJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No imports yet. Import a conversation to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Date</th>
                  <th className="text-left py-2 pr-4 font-medium">Filename</th>
                  <th className="text-right py-2 pr-4 font-medium">Messages</th>
                  <th className="text-right py-2 pr-4 font-medium">Skipped</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-right py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {importJobs.map((job) => {
                  const net = job.parsedMessages - job.skippedDuplicates;
                  return (
                    <tr
                      key={job._id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatRelativeTimestamp(job.startedAt)}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className="block truncate max-w-[200px]"
                          title={job.sourceFilename}
                        >
                          {job.sourceFilename}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {net.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {job.skippedDuplicates.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={job.status} error={job.error} />
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDuration(job.startedAt, job.completedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
