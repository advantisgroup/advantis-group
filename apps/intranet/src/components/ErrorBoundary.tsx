"use client";

import { Component, type ReactNode } from "react";

import { ErrorFallback } from "@/components/ErrorFallback";

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Custom fallback. Receives a `reset` callback that clears the error and
   * re-renders the children. Defaults to the shared `ErrorFallback` card.
   */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions in its subtree so a crashing page no longer
 * takes down the whole app (the Next.js application-error screen). Wrap page
 * content with this to keep the surrounding shell — nav, sidebar — usable.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.reset });
      }
      return <ErrorFallback description={error.message} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
