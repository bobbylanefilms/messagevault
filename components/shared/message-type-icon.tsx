// ABOUTME: Maps message types from the schema to their corresponding Lucide icons.
// ABOUTME: Used in browse view, search results, and calendar day detail to indicate content type.

import {
  MessageSquareText,
  ImageIcon,
  Video,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

const iconMap: Record<
  MessageType,
  React.ComponentType<{ className?: string }>
> = {
  text: MessageSquareText,
  image: ImageIcon,
  video: Video,
  link: Link2,
  attachment_missing: AlertTriangle,
};

const labelMap: Record<MessageType, string> = {
  text: "Text message",
  image: "Image",
  video: "Video",
  link: "Link",
  attachment_missing: "Missing attachment",
};

interface MessageTypeIconProps {
  type: MessageType;
  className?: string;
  showLabel?: boolean;
}

export function MessageTypeIcon({
  type,
  className,
  showLabel = false,
}: MessageTypeIconProps) {
  const Icon = iconMap[type];
  const label = labelMap[type];

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          type === "attachment_missing"
            ? "text-destructive"
            : "text-muted-foreground",
          className,
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </span>
  );
}
