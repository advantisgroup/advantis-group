"use client";

import { useCallback } from "react";

import { useAction } from "convex/react";
import { toast } from "sonner";

import { useErrorHandler } from "@/hooks/use-error-handler";

import { activityErrorText } from "./errors";
import { useI18n } from "./i18n";

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * A Convex action for ActivityTrack: success optionally raises a toast
 * (`{ success }`), failure always shows localised copy through the shared
 * `useErrorHandler` — ActivityTrack's own wording for the codes it knows,
 * the shared `Errors` copy otherwise — and resolves to `undefined` instead of
 * throwing, so callers can branch on the result without a try/catch.
 */
export function useActionWithToast<Action extends FunctionReference<"action">>(ref: Action) {
  const run = useAction(ref);
  const handleError = useErrorHandler();
  const { t } = useI18n();

  return useCallback(
    async (
      args: FunctionArgs<Action>,
      opts?: { success?: string },
    ): Promise<FunctionReturnType<Action> | undefined> => {
      try {
        const result = (await run(args)) as FunctionReturnType<Action>;
        if (opts?.success) toast.success(opts.success);
        return result;
      } catch (err) {
        handleError(err, activityErrorText(t, err));
        return undefined;
      }
    },
    [run, handleError, t],
  );
}
