// ABOUTME: Real-time import progress display with reactive Convex queries.
// ABOUTME: Shows parsing progress bar, status text, duplicate count, and completion actions.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

interface ImportProgressProps {
  jobId: Id<"importJobs">;
  onNewImport: () => void;
}

export function ImportProgress({ jobId, onNewImport }: ImportProgressProps) {
  const job = useQuery(api.importJobs.get, { jobId });

  if (!job) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isActive = job.status === "parsing" || job.status === "embedding";
  const isComplete = job.status === "completed";
  const isFailed = job.status === "failed";

  const progress =
    job.totalMessages > 0
      ? Math.round((job.parsedMessages / job.totalMessages) * 100)
      : 0;

  const statusLabel =
    job.status === "parsing"
      ? "Parsing messages..."
      : job.status === "embedding"
        ? "Generating embeddings..."
        : job.status === "completed"
          ? "Import complete"
          : job.status === "failed"
            ? "Import failed"
            : "Starting...";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {isActive && <Loader2 className="h-5 w-5 animate-spin" />}
          {isComplete && <CheckCircle className="h-5 w-5 text-emerald-400" />}
          {isFailed && <AlertCircle className="h-5 w-5 text-destructive" />}
          {statusLabel}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{job.sourceFilename}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar */}
        {(job.status === "parsing" || isComplete) && job.totalMessages > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {job.parsedMessages.toLocaleString()} /{" "}
                {job.totalMessages.toLocaleString()} messages
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${isComplete ? 100 : progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Embedding progress */}
        {job.status === "embedding" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {job.embeddedMessages.toLocaleString()} /{" "}
                {job.totalMessages.toLocaleString()} embeddings
              </span>
              <span className="font-medium">
                {job.totalMessages > 0
                  ? Math.round(
                      (job.embeddedMessages / job.totalMessages) * 100
                    )
                  : 0}
                %
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${
                    job.totalMessages > 0
                      ? Math.round(
                          (job.embeddedMessages / job.totalMessages) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        {job.parsedMessages > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{job.parsedMessages.toLocaleString()} messages imported</span>
            {job.skippedDuplicates > 0 && (
              <span>
                {job.skippedDuplicates.toLocaleString()} duplicates skipped
              </span>
            )}
          </div>
        )}

        {/* Error display */}
        {isFailed && job.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {job.error}
          </div>
        )}

        {/* Completion actions */}
        {(isComplete || job.status === "embedding") && job.conversationId && (
          <div className="flex gap-2 pt-2">
            <Button asChild>
              <Link href={`/browse/${job.conversationId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Browse Conversation
              </Link>
            </Button>
            <Button variant="outline" onClick={onNewImport}>
              Import Another
            </Button>
          </div>
        )}

        {/* Failed actions */}
        {isFailed && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onNewImport}>
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
