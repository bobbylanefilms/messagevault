// ABOUTME: Import wizard page — guides the user through uploading and scanning an Apple Messages export.
// ABOUTME: Implements a multi-step flow: upload → preview → identity (B2) → parsing (B3+).

"use client";

import { useState, useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { FileDropZone } from "@/components/import/file-drop-zone";
import { HeaderPreview } from "@/components/import/header-preview";
import { IdentityResolution } from "@/components/import/identity-resolution";
import { ImportProgress } from "@/components/import/import-progress";
import { ImportHistory } from "@/components/import/import-history";
import { scanHeader, type ScannedHeader } from "@/lib/header-scanner";
import type { Id } from "@/convex/_generated/dataModel";

type ImportStep = "upload" | "preview" | "identity" | "parsing";

interface UploadedFile {
  filename: string;
  content: string;
  header: ScannedHeader;
}

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [jobId, setJobId] = useState<Id<"importJobs"> | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [participantMap, setParticipantMap] = useState<Record<string, string> | null>(null);

  const createJob = useMutation(api.importJobs.create);
  const startImportAction = useAction(api["import"].startImport);

  const handleFileLoaded = useCallback(
    (filename: string, content: string) => {
      const header = scanHeader(content);
      setUploadedFile({ filename, content, header });
      setStep("preview");
    },
    []
  );

  const handlePreviewConfirm = useCallback(async () => {
    if (!uploadedFile) return;
    setIsCreatingJob(true);
    try {
      const id = await createJob({
        sourceFilename: uploadedFile.filename,
        totalLines: uploadedFile.header.totalLines,
        fileContent: uploadedFile.content,
      });
      setJobId(id);
      setStep("identity");
    } catch (err) {
      console.error("Failed to create import job:", err);
    } finally {
      setIsCreatingJob(false);
    }
  }, [uploadedFile, createJob]);

  const handleIdentityResolved = useCallback(
    async (map: Record<string, string>) => {
      setParticipantMap(map);
      setStep("parsing");

      if (!jobId || !uploadedFile) return;

      try {
        await startImportAction({
          jobId,
          fileContent: uploadedFile.content,
          participantMap: map,
          conversationTitle: uploadedFile.header.title,
          sourceFilename: uploadedFile.filename,
          isGroupChat: uploadedFile.header.participantNames.length > 2,
          participantIds: Object.values(map),
          metadata: {
            contactInfo: uploadedFile.header.contactInfo ?? undefined,
            exportedAt: uploadedFile.header.exportedAt ?? undefined,
            totalMessagesReported:
              uploadedFile.header.totalMessagesReported ?? undefined,
          },
        });
      } catch (err) {
        console.error("Failed to start import:", err);
      }
    },
    [jobId, uploadedFile, startImportAction]
  );

  const handleCancel = useCallback(() => {
    setStep("upload");
    setUploadedFile(null);
    setJobId(null);
    setParticipantMap(null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Import Conversations"
        description="Upload an Apple Messages markdown export to add it to your archive."
      />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Step: Upload */}
          {step === "upload" && (
            <FileDropZone onFileLoaded={handleFileLoaded} />
          )}

          {/* Step: Preview */}
          {step === "preview" && uploadedFile && (
            <HeaderPreview
              filename={uploadedFile.filename}
              header={uploadedFile.header}
              onConfirm={handlePreviewConfirm}
              onCancel={handleCancel}
              isLoading={isCreatingJob}
            />
          )}

          {/* Step: Identity Resolution */}
          {step === "identity" && uploadedFile && (
            <IdentityResolution
              participantNames={uploadedFile.header.participantNames}
              onComplete={handleIdentityResolved}
              onCancel={handleCancel}
            />
          )}

          {/* Step: Parsing — real-time progress */}
          {step === "parsing" && jobId && (
            <ImportProgress jobId={jobId} onNewImport={handleCancel} />
          )}

          {/* Import history (always shown below the wizard) */}
          <ImportHistory />
        </div>
      </div>
    </div>
  );
}
