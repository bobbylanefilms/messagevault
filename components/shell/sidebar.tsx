"use client";

// ABOUTME: App sidebar — primary navigation with live conversation list and view links.
// ABOUTME: Collapsible on desktop (rail mode shows icons only), rendered in Sheet on mobile.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Search,
  Bot,
  Upload,
  Settings,

  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarStore } from "@/lib/stores/use-sidebar-store";
import { ConversationList } from "@/components/browse/conversation-list";

const viewNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/search", label: "Search", icon: Search },
  { href: "/chat", label: "AI Chat", icon: Bot },
] as const;

const utilityNavItems = [
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isCollapsed: boolean;
}

function NavItem({ href, label, icon: Icon, isActive, isCollapsed }: NavItemProps) {
  const linkContent = (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        isCollapsed && "justify-center px-2"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-sidebar-primary" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span>{label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out",
          isCollapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"
        )}
      >
        {/* Messages section */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
              {!isCollapsed && (
                <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
                  Messages
                </h2>
              )}
              <ConversationList isCollapsed={isCollapsed} />
            </div>
          </ScrollArea>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Views section */}
        <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
          {!isCollapsed && (
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
              Views
            </h2>
          )}
          <div className="space-y-1">
            {viewNavItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActiveRoute(pathname, item.href)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Utility links */}
        <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
          <div className="space-y-1">
            {utilityNavItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActiveRoute(pathname, item.href)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        </div>

        {/* Collapse toggle */}
        <div className={cn("border-t border-sidebar-border p-3", isCollapsed && "p-2")}>
          <Button
            variant="ghost"
            size={isCollapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            className={cn(
              "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isCollapsed ? "w-full justify-center" : "w-full justify-start gap-3"
            )}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </nav>
    </TooltipProvider>
  );
}
