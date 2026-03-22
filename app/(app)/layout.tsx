// ABOUTME: App shell layout — auth guard, top bar, collapsible sidebar, and main content area.
// ABOUTME: Wraps all authenticated routes with persistent navigation chrome.

"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Topbar } from "@/components/shell/topbar";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Toaster } from "sonner";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const ensureUser = useMutation(api.users.ensureUser);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      ensureUser().catch(() => {
        // User already exists — this is expected on subsequent loads
      });
    }
  }, [isLoaded, isSignedIn, ensureUser]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <MobileSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}
