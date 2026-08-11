"use client";

import { useCallback } from "react";

import { useMutation } from "convex/react";

import { errorMessage } from "./errors";
import { useI18n } from "./i18n";
import { useToast } from "./useToast";

import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

/**
 * A Convex mutation wrapped so that:
 *   - success optionally raises a green toast (pass `{ success }`)
 *   - failure ALWAYS raises a red toast with a readable, localized message and
 *     logs the raw error to the console — never silently swallowed.
 *
 * On failure it resolves to `undefined` (rather than rethrowing) so callers
 * don't have to wrap every call in try/catch and we never emit an unhandled
 * rejection. Callers that need to branch on success can check the return value.
 */
export function useMutationWithToast<Mutation extends FunctionReference<"mutation">>(
  mutationRef: Mutation,
) {
  const mutate = useMutation(mutationRef);
  const toast = useToast();
  const { t } = useI18n();

  return useCallback(
    async (
      args: FunctionArgs<Mutation>,
      opts?: { success?: string },
    ): Promise<FunctionReturnType<Mutation> | undefined> => {
      try {
        const result = (await mutate(args)) as FunctionReturnType<Mutation>;
        if (opts?.success) toast(opts.success, "ok");
        // Generic Convex return type is opaque to the linter (resolves to `any`).
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result;
      } catch (err) {
        toast(errorMessage(t, err), "danger");
        console.error("[mutation failed]", err);
        return undefined;
      }
    },
    [mutate, toast, t],
  );
}
