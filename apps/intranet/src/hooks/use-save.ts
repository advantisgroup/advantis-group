"use client";

import { useCallback } from "react";

import { useMutation } from "convex/react";
import { toast } from "sonner";

import { useErrorHandler } from "@/hooks/use-error-handler";

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * A Convex mutation for the places that used to fire and forget: success can
 * say what happened (`{ success }`), failure always shows localised copy via
 * `useErrorHandler` (`{ error }` as its fallback), and nothing throws — it
 * resolves to `undefined` on failure, so `void save(…)` in a click handler is
 * safe and a caller that cares can check the result.
 */
export function useSave<Mutation extends FunctionReference<"mutation">>(mutationRef: Mutation) {
  const mutate = useMutation(mutationRef);
  const handleError = useErrorHandler();

  return useCallback(
    async (
      args: FunctionArgs<Mutation>,
      opts?: { success?: string; error?: string },
    ): Promise<FunctionReturnType<Mutation> | undefined> => {
      try {
        const result = (await mutate(args)) as FunctionReturnType<Mutation>;
        if (opts?.success) toast.success(opts.success);
        return result;
      } catch (err) {
        handleError(err, opts?.error);
        return undefined;
      }
    },
    [mutate, handleError],
  );
}
