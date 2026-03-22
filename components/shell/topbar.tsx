"use client";

// ABOUTME: Top navigation bar — logo, search shortcut, import button, and Clerk UserButton.
// ABOUTME: Persistent across all authenticated routes; includes mobile menu trigger.

import Link from "next/link";
import { Menu, Search, Upload } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarStore } from "@/lib/stores/use-sidebar-store";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export function Topbar() {
  const { setMobileOpen } = useSidebarStore();

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        {/* Left: mobile menu + logo */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-muted-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            MessageVault
          </Link>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/search">
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Search</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/import">
                  <Upload className="h-4 w-4" />
                  <span className="sr-only">Import</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import conversations</TooltipContent>
          </Tooltip>

          <ThemeToggle />

          <UserButton />
        </div>
      </header>
    </TooltipProvider>
  );
}
