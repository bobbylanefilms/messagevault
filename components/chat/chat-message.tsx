// ABOUTME: Individual chat message — renders user or assistant messages with appropriate styling.
// ABOUTME: Assistant messages include markdown rendering, thinking toggle, copy button, and model badge.

"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Brain, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MODEL_BADGES: Record<string, { label: string; className: string }> = {
  "claude-opus-4-6": { label: "Opus", className: "text-amber-400 border-amber-400/30" },
  "claude-sonnet-4-6": { label: "Sonnet", className: "text-blue-400 border-blue-400/30" },
  "claude-haiku-4-5": { label: "Haiku", className: "text-emerald-400 border-emerald-400/30" },
};

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  model?: string;
  thinkingContent?: string;
  timestamp?: number;
  retrievedMessageIds?: string[];
  retrievalStrategy?: string;
  /** Slot for source attribution (rendered by parent) */
  sourcesSlot?: React.ReactNode;
}

export function ChatMessage({
  role,
  content,
  model,
  thinkingContent,
  timestamp,
  sourcesSlot,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (role === "user") {
    return (
      <div className="flex flex-col items-end">
        <div
          className="max-w-[70%] rounded-2xl rounded-br-lg px-4 py-2.5 text-[14px] leading-relaxed text-white"
          style={{ backgroundColor: "var(--color-bubble-me)" }}
        >
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
        {timestamp && (
          <span className="mr-1 mt-0.5 text-[10px] text-muted-foreground">
            {new Date(timestamp).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    );
  }

  // Assistant message
  const badge = model ? MODEL_BADGES[model] : null;

  return (
    <div className="flex flex-col items-start">
      <div className="group relative max-w-[80%] rounded-2xl rounded-bl-lg border border-border px-4 py-3 text-[14px] leading-relaxed bg-card text-foreground">
        {/* Model badge */}
        {badge && (
          <Badge
            variant="outline"
            className={cn("mb-2 h-5 px-1.5 text-[10px]", badge.className)}
          >
            {badge.label}
          </Badge>
        )}

        {/* Thinking section */}
        {thinkingContent && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Brain className="h-3.5 w-3.5" />
              {showThinking ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {showThinking ? "Hide thinking" : "Show thinking"}
            </button>
            {showThinking && (
              <div className="mt-2 mb-3 max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
                <pre className="whitespace-pre-wrap text-[13px] font-mono text-muted-foreground">
                  {thinkingContent}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Content with markdown */}
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
            {content}
          </ReactMarkdown>
        </div>

        {/* Copy button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Source attribution slot */}
      {sourcesSlot}

      {/* Timestamp */}
      {timestamp && (
        <span className="ml-1 mt-0.5 text-[10px] text-muted-foreground">
          {new Date(timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}
