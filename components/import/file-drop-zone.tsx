// ABOUTME: Drag-and-drop file upload zone for Apple Messages markdown exports.
// ABOUTME: Validates file type (.md/.txt), size (max 50MB), reads content via FileReader.

"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_EXTENSIONS = [".md", ".txt"];

interface FileDropZoneProps {
  onFileLoaded: (filename: string, content: string) => void;
}

export function FileDropZone({ onFileLoaded }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validateFile(file: File): string | null {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type "${ext}". Please upload a .md or .txt file.`;
    }
    if (file.size === 0) {
      return "The file is empty.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 50 MB.`;
    }
    return null;
  }

  const readFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setIsReading(true);

      const reader = new FileReader();
      reader.onload = (e) => {
        setIsReading(false);
        const content = e.target?.result;
        if (typeof content === "string") {
          onFileLoaded(file.name, content);
        } else {
          setError("Failed to read file content.");
        }
      };
      reader.onerror = () => {
        setIsReading(false);
        setError("An error occurred while reading the file.");
      };
      reader.readAsText(file, "utf-8");
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only clear drag state when leaving the drop zone entirely
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    },
    []
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [readFile]
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload file — drag and drop or click to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-16 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
          isReading && "pointer-events-none opacity-60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={handleInputChange}
        />

        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full transition-colors",
            isDragOver ? "bg-primary/10" : "bg-muted"
          )}
        >
          {isReading ? (
            <FileText className="h-8 w-8 animate-pulse text-muted-foreground" />
          ) : (
            <Upload
              className={cn(
                "h-8 w-8 transition-colors",
                isDragOver ? "text-primary" : "text-muted-foreground"
              )}
            />
          )}
        </div>

        <div className="text-center">
          {isReading ? (
            <p className="text-sm text-muted-foreground">Reading file…</p>
          ) : (
            <>
              <p className="font-medium">
                {isDragOver ? "Drop your file here" : "Drop your export here"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or{" "}
                <span className="text-primary underline underline-offset-2">
                  browse to upload
                </span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                .md or .txt · up to 50 MB
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
