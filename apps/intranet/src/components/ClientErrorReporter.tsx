"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { reportClientError } from "@/lib/errors";

/** Catches browser failures outside React render boundaries, such as an async
 * event handler or an unawaited promise, and routes them through the same
 * safe log-and-display policy as action errors. */
export function ClientErrorReporter() {
  const t = useTranslations("Errors");

  useEffect(() => {
    const notify = (error: unknown, source: string) => {
      const { code } = reportClientError(error, source);
      toast.error(code ? t(code) : t("generic"));
    };
    const onError = (event: ErrorEvent) => notify(event.error ?? event.message, "window.error");
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      notify(event.reason, "window.unhandledrejection");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [t]);

  return null;
}
