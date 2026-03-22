// ABOUTME: Landing page — public entry point with Clerk authentication.
// ABOUTME: Shows sign-in/sign-up tabs with dark theme styling; redirects authenticated users to /dashboard.

"use client";

import { useState } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (isSignedIn) {
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">MessageVault</h1>
          <p className="mt-2 text-muted-foreground">
            Your family message archive
          </p>
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => setMode("sign-in")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === "sign-in"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode("sign-up")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              mode === "sign-up"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign Up
          </button>
        </div>

        <div className="flex justify-center">
          {mode === "sign-in" ? (
            <SignIn routing="hash" />
          ) : (
            <SignUp routing="hash" />
          )}
        </div>
      </div>
    </main>
  );
}
