// ABOUTME: Streaming assistant message — subscribes to persistent-text-stream for real-time display.
// ABOUTME: Shows typing indicator before first token, then renders incrementally.

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useStream } from "@convex-dev/persistent-text-streaming/react";
import type { StreamId } from "@convex-dev/persistent-text-streaming";
import { api } from "@/convex/_generated/api";
import { getConvexSiteUrl } from "@/lib/convex-url";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const MODEL_BADGES: Record<string, { label: string; className: string }> = {
  "claude-opus-4-6": { label: "Opus", className: "text-amber-400 border-amber-400/30" },
  "claude-sonnet-4-6": { label: "Sonnet", className: "text-blue-400 border-blue-400/30" },
  "claude-haiku-4-5": { label: "Haiku", className: "text-emerald-400 border-emerald-400/30" },
};

interface ChatStreamingMessageProps {
  streamId: string;
  driven: boolean;
  model?: string;
  sessionId: string;
}

export function ChatStreamingMessage({
  streamId,
  driven,
  model,
  sessionId,
}: ChatStreamingMessageProps) {
  const { getToken } = useAuth();
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    getToken({ template: "convex" }).then(setAuthToken);
  }, [getToken]);

  const convexSiteUrl = getConvexSiteUrl();
  const streamUrl = new URL(`${convexSiteUrl}/chat-stream`);

  const { text, status } = useStream(
    api.chat.getStreamBody,
    streamUrl,
    driven && authToken !== null,
    streamId ? (streamId as StreamId) : undefined,
    {
      authToken,
      headers: { "X-Session-Id": sessionId },
    }
  );

  const badge = model ? MODEL_BADGES[model] : null;
  const showTypingIndicator = status === "pending" || (status === "streaming" && !text);
  const showStreamingText = status === "streaming" && text;
  const isError = status === "error";

  return (
    <div className="flex flex-col items-start">
      <div
        className={cn(
          "min-h-[40px] max-w-[80%] rounded-2xl rounded-bl-lg border px-4 py-3 text-[14px] leading-relaxed",
          isError
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border bg-card text-foreground"
        )}
      >
        {/* Model badge */}
        {badge && (
          <Badge
            variant="outline"
            className={cn("mb-2 h-5 px-1.5 text-[10px]", badge.className)}
          >
            {badge.label}
          </Badge>
        )}

        {/* Typing indicator */}
        {showTypingIndicator && (
          <div className="flex items-center gap-1.5 py-1">
            <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" />
            <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" />
          </div>
        )}

        {/* Streaming text */}
        {showStreamingText && (
          <div className="prose-chat">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                code: (props) => {
                  const { children, className } = props;
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3">
                      <code className="text-[13px] font-mono">{children}</code>
                    </pre>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-primary underline hover:text-primary/80"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                blockquote: ({ children }) => (
                  <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
            <span className="animate-pulse">&#9613;</span>
          </div>
        )}

        {/* Error */}
        {isError && <p>{text || "An error occurred while generating the response."}</p>}

        {/* Done — text rendered but no cursor */}
        {status === "done" && text && (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
