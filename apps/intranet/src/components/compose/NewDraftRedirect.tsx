"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";

import { type DraftSurface } from "@/components/compose/use-draft";
import { useErrorHandler } from "@/hooks/use-error-handler";

/**
 * What a composer's `/new` route renders: opens a fresh draft and swaps the
 * URL for that draft's own, so the work has an address before anything's
 * typed. `replace`, so Back doesn't land here and open another one.
 */
export function NewDraftRedirect({
  surface,
  to,
}: {
  surface: DraftSurface;
  to: (draftId: string) => string;
}) {
  const router = useRouter();
  const createDraft = useMutation(api.drafts.drafts.create);
  const handleError = useErrorHandler();
  const started = useRef(false);
  const toRef = useRef(to);
  toRef.current = to;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createDraft({ surface })
      .then((draftId) => router.replace(toRef.current(draftId)))
      .catch((e) => {
        handleError(e);
        started.current = false;
      });
  }, [surface, createDraft, router, handleError]);

  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}
