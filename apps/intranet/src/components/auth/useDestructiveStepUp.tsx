"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { StepUpDialog } from "./StepUpDialog";
import type { StepMethod } from "./StepUpForm";

/** Structurally matches `StepUpHint` from `packages/convex/convex/lib/stepUp.ts`,
 * which apps/api echoes back from the removal routes instead of acting. Not
 * imported directly — that module lives on the Convex build, not this
 * package's client surface. Same shape `PasswordResetsPanel` already checks. */
export interface StepUpHintShape {
  needsStepUp: true;
  requiredLevel: number;
  availableMethods: StepMethod[];
}

export function isStepUpHint(value: unknown): value is StepUpHintShape {
  return (
    typeof value === "object" && value !== null && (value as StepUpHintShape).needsStepUp === true
  );
}

/**
 * Wraps an action that removes a security credential.
 *
 * The server answers such a call with either the real result or a
 * `{ needsStepUp: true }` hint, depending on whether this session has proved
 * itself recently enough. This hook owns the dialog that closes that gap, so
 * every card guarding a removal behaves the same way instead of each growing
 * its own copy of the verify-then-retry dance.
 */
export function useDestructiveStepUp(): {
  runGuarded: <T>(action: () => Promise<T | StepUpHintShape>) => Promise<T | null>;
  dialog: ReactNode;
} {
  const [methods, setMethods] = useState<StepMethod[] | null>(null);
  const resolver = useRef<((verified: boolean) => void) | null>(null);

  /** Shows the dialog and resolves once the user either verifies or closes it. */
  const openVerification = useCallback((availableMethods: StepMethod[]) => {
    setMethods(availableMethods);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((verified: boolean) => {
    resolver.current?.(verified);
    resolver.current = null;
    setMethods(null);
  }, []);

  const runGuarded = useCallback(
    async <T,>(action: () => Promise<T | StepUpHintShape>): Promise<T | null> => {
      const first = await action();
      if (!isStepUpHint(first)) return first;

      const verified = await openVerification(first.availableMethods);
      if (!verified) return null;

      // Exactly one retry, the same as `PasswordResetsPanel`. A second hint
      // after a successful verification means the requirement itself moved
      // (a policy change, an expired window) — prompting again would just
      // loop the user through the same dialog, so return null and let the
      // caller stay quiet rather than claim a success that didn't happen.
      const second = await action();
      return isStepUpHint(second) ? null : second;
    },
    [openVerification],
  );

  const dialog = (
    <StepUpDialog
      open={methods !== null}
      availableMethods={methods ?? []}
      context="destructive"
      onVerified={() => settle(true)}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    />
  );

  return { runGuarded, dialog };
}
