"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/errors";

/**
 * Last-resort boundary that catches errors in the root layout itself. When it
 * renders, the normal layout (and its providers) is gone, so it must supply its
 * own <html>/<body> and cannot use translations — copy is intentionally static.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "global-boundary");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f7f3ec",
          color: "#211e1b",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#6b6b6b", margin: "0 0 20px" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              cursor: "pointer",
              border: "1px solid #d4ccbf",
              background: "transparent",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "inherit",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
