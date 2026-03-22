"use client";

// ABOUTME: React error boundary with retry — catches render errors in child components.
// ABOUTME: Shows a friendly error message with a retry button to remount the subtree.

import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full min-h-[200px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive/70" />
            <h2 className="mt-4 text-lg font-semibold">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.error?.message ||
                "An unexpected error occurred. Please try again."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="mt-4 gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
