"use client";

import { useCallback } from "react";

import { useAction } from "convex/react";

import { errorMessage } from "./errors";
import { useI18n } from "./i18n";
import { useToast } from "./useToast";

import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";

/**
 * The action counterpart of `useMutationWithToast`: a Convex action wrapped so
 * that success optionally raises a green toast and failure ALWAYS raises a red
 * toast with a readable, localized message (and logs the raw error) — never
 * silently swallowed.
 *
 * On failure it resolves to `undefined` (rather than rethrowing) so callers can
 * branch on the result without a try/catch and we never emit an unhandled
 * rejection.
 */
export function useActionWithToast<Action extends FunctionReference<"action">>(
  actionRef: Action
) {
  const run = useAction(actionRef);
  const toast = useToast();
  const { t } = useI18n();

  return useCallback(
    async (
      args: FunctionArgs<Action>,
      opts?: { success?: string }
    ): Promise<FunctionReturnType<Action> | undefined> => {
      try {
        const result = (await run(args)) as FunctionReturnType<Action>;
        if (opts?.success) toast(opts.success, "ok");
        // Generic Convex return type is opaque to the linter (resolves to `any`).
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result;
      } catch (err) {
        toast(errorMessage(t, err), "danger");
        console.error("[action failed]", err);
        return undefined;
      }
    },
    [run, toast, t]
  );
}
