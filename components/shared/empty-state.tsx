// ABOUTME: Reusable empty state pattern — icon, title, description, and optional CTA.
// ABOUTME: Used across all views when no data is available (no conversations, no search results, etc.).

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center p-8",
        className,
      )}
    >
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
          <Icon className="h-7 w-7 text-muted-foreground/70" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button asChild variant="outline" size="sm" className="mt-5">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
