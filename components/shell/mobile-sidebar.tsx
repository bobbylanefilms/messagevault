"use client";

// ABOUTME: Mobile sidebar — wraps the Sidebar component in a Sheet for narrow viewports.
// ABOUTME: Controlled by the sidebar Zustand store's isMobileOpen state.

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/shell/sidebar";
import { useSidebarStore } from "@/lib/stores/use-sidebar-store";
import { VisuallyHidden } from "radix-ui";

export function MobileSidebar() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();

  return (
    <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side="left"
        className="w-[var(--sidebar-width)] p-0 bg-sidebar border-sidebar-border"
        showCloseButton={false}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) {
            setMobileOpen(false);
          }
        }}
      >
        <VisuallyHidden.Root>
          <SheetTitle>Navigation</SheetTitle>
        </VisuallyHidden.Root>
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
