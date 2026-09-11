"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";

export type DraftSurface = FunctionArgs<typeof api.drafts.get>["surface"];
export type DraftSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 800;
// A save and its last draft write can land a few seconds apart, in either order.
const SAVE_RACE_MS = 10_000;

export interface Draft {
  status: DraftSaveStatus;
  savedAt: number | null;
  /** Set when the form was filled from a stored draft on open. */
  restoredAt: number | null;
  /** A stored draft for something that already exists, waiting on a decision. */
  offer: { savedAt: number } | null;
  acceptOffer: () => void;
  declineOffer: () => void;
  /** Throw the stored draft away — after a successful submit, or on request.
   * Pass the value the form is being reset to, if it is. */
  clear(baseline?: unknown): Promise<void>;
  hydrated: boolean;
}

/**
 * Whether an unsaved draft for something that already exists is still worth
 * offering back. `draftSavedAt` is when the draft was last written;
 * `entitySavedAt` is when the real record was last saved — by anyone, so it
 * can be newer than the draft if a colleague edited it in the meantime.
 */
export function shouldOfferDraft(draftSavedAt: number, entitySavedAt: number | undefined): boolean {
  if (entitySavedAt === undefined) return true;
  return draftSavedAt + SAVE_RACE_MS >= entitySavedAt;
}

/**
 * Keeps a form's state on the server as it's typed, per person.
 *
 * `restore: "auto"` fills the form from a stored draft on open — right for
 * "new" forms, where the draft *is* the thing. `"offer"` holds it back as a
 * question instead — right for editing something that already exists, where
 * silently swapping in an older draft over what's saved would be a surprise.
 * Typing past an offer declines it.
 */
export function useDraft<T>({
  surface,
  subjectKey,
  value,
  onRestore,
  isEmpty,
  restore = "auto",
  entitySavedAt,
  enabled = true,
}: {
  surface: DraftSurface;
  subjectKey: string;
  value: T;
  onRestore: (data: T) => void;
  /** An empty form deletes its draft instead of saving a blank one. */
  isEmpty?: (value: T) => boolean;
  restore?: "auto" | "offer";
  /** When the record being edited was last saved — see `shouldOfferDraft`. */
  entitySavedAt?: number;
  enabled?: boolean;
}): Draft {
  const stored = useQuery(api.drafts.get, enabled ? { surface, subjectKey } : "skip");
  const saveDraft = useMutation(api.drafts.save);
  const discardDraft = useMutation(api.drafts.discard);

  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [offer, setOffer] = useState<{ data: string; savedAt: number } | null>(null);

  const serialized = useMemo(() => JSON.stringify(value), [value]);
  const latest = useRef({ serialized, value, surface, subjectKey, isEmpty, entitySavedAt });
  latest.current = { serialized, value, surface, subjectKey, isEmpty, entitySavedAt };
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const lastSaved = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((data: string, at: number) => {
    try {
      onRestoreRef.current(JSON.parse(data) as T);
      lastSaved.current = data;
      setRestoredAt(at);
      setSavedAt(at);
      setStatus("saved");
    } catch {
      // A draft written by an older shape of this form — start fresh rather
      // than crash the composer over it.
    }
  }, []);

  useEffect(() => {
    if (!enabled || hydratedRef.current || stored === undefined) return;
    lastSaved.current = latest.current.serialized;
    if (stored) {
      if (restore === "auto") {
        apply(stored.data, stored.updatedAt);
      } else if (shouldOfferDraft(stored.updatedAt, latest.current.entitySavedAt)) {
        setOffer({ data: stored.data, savedAt: stored.updatedAt });
      } else {
        void discardDraft({
          surface: latest.current.surface,
          subjectKey: latest.current.subjectKey,
        });
      }
    }
    hydratedRef.current = true;
    setHydrated(true);
  }, [enabled, stored, restore, apply, discardDraft]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!hydratedRef.current) return;
    const { serialized, value, surface, subjectKey, isEmpty } = latest.current;
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    setStatus("saving");
    try {
      if (isEmpty?.(value)) {
        await discardDraft({ surface, subjectKey });
        setSavedAt(null);
        setStatus("idle");
      } else {
        const { updatedAt } = await saveDraft({ surface, subjectKey, data: serialized });
        setSavedAt(updatedAt);
        setStatus(latest.current.serialized === serialized ? "saved" : "pending");
      }
    } catch {
      lastSaved.current = null;
      setStatus("error");
    }
  }, [saveDraft, discardDraft]);

  useEffect(() => {
    if (!enabled || !hydrated || serialized === lastSaved.current) return;
    setOffer(null);
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [enabled, hydrated, serialized, flush]);

  // Don't wait out the debounce when the tab is hidden or the form unmounts —
  // on a phone, "hidden" is often the last moment code gets to run at all.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  const unsaved = status === "pending" || status === "saving";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const clear = useCallback(
    async (baseline?: unknown) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      // When the form is being reset in the same breath, the value it's reset
      // to is what counts as "saved" — otherwise the reset itself would be
      // written straight back as a fresh draft.
      lastSaved.current =
        baseline === undefined ? latest.current.serialized : JSON.stringify(baseline);
      setOffer(null);
      setSavedAt(null);
      setRestoredAt(null);
      setStatus("idle");
      await discardDraft({
        surface: latest.current.surface,
        subjectKey: latest.current.subjectKey,
      });
    },
    [discardDraft],
  );

  return {
    status,
    savedAt,
    restoredAt,
    offer: offer ? { savedAt: offer.savedAt } : null,
    acceptOffer: () => {
      if (offer) apply(offer.data, offer.savedAt);
      setOffer(null);
    },
    declineOffer: () => {
      setOffer(null);
      void clear();
    },
    clear,
    hydrated,
  };
}
