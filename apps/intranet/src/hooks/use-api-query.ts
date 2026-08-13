"use client";

import { useCallback, useEffect, useState } from "react";

import { reportClientError } from "@/lib/errors";

export type ApiQueryStatus = "idle" | "loading" | "success" | "error";

export interface ApiQuery<T> {
  data: T | undefined;
  error: unknown;
  status: ApiQueryStatus;
  refresh: () => void;
}

export function useApiQuery<T>(
  load: () => Promise<T>,
  { enabled = true, source }: { enabled?: boolean; source: string },
): ApiQuery<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<ApiQuery<T>, "refresh">>({
    data: undefined,
    error: undefined,
    status: enabled ? "loading" : "idle",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ data: undefined, error: undefined, status: "idle" });
      return;
    }

    let current = true;
    setState((previous) => ({ ...previous, error: undefined, status: "loading" }));
    void load().then(
      (data) => {
        if (current) setState({ data, error: undefined, status: "success" });
      },
      (error: unknown) => {
        reportClientError(error, source);
        if (current) setState((previous) => ({ ...previous, error, status: "error" }));
      },
    );
    return () => {
      current = false;
    };
  }, [enabled, load, source, version]);

  return {
    ...state,
    refresh: useCallback(() => setVersion((current) => current + 1), []),
  };
}
