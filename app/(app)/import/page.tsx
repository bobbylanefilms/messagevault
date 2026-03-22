// ABOUTME: Import page placeholder — will be built in B1.
// ABOUTME: Will provide drag-and-drop upload for Apple Messages exports.

import { Upload } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function ImportPage() {
  return (
    <EmptyState
      icon={Upload}
      title="Import Conversations"
      description="Drag and drop your Apple Messages export file to get started. Supports .md and .txt files."
    />
  );
}
