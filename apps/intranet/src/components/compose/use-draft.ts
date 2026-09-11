"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";

export type DraftSurface = FunctionArgs<typeof api.drafts.get>["surface"];
export type DraftSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 800;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;
// A save and its last draft write can land a few seconds apart, in either order.
const SAVE_RACE_MS = 10_000;

export interface Draft {
  status: DraftSaveStatus;
  savedAt: number | null;
  /** Set when the form was filled from a stored draft on open. */
  restoredAt: number | null;
  /** A stored draft waiting on a decision: an older one for something that
   *  already exists, or (`remote`) a newer one saved from another tab. */
  offer: { savedAt: number; remote: boolean } | null;
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
  const [offer, setOffer] = useState<{ data: string; savedAt: number; remote: boolean } | null>(
    null,
  );

  const serialized = useMemo(() => JSON.stringify(value), [value]);
  const latest = useRef({ serialized, value, surface, subjectKey, isEmpty, entitySavedAt });
  latest.current = { serialized, value, surface, subjectKey, isEmpty, entitySavedAt };
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const lastSaved = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const hydratedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  // What this tab wrote recently. A save can still be on its way back while a
  // newer one goes out, and its echo mustn't read as another tab's change.
  const recentWrites = useRef<string[]>([]);

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
    hydratedAt.current = stored?.updatedAt ?? 0;
    if (stored) {
      if (restore === "auto") {
        apply(stored.data, stored.updatedAt);
      } else if (shouldOfferDraft(stored.updatedAt, latest.current.entitySavedAt)) {
        setOffer({ data: stored.data, savedAt: stored.updatedAt, remote: false });
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

  // Another tab (or device) saved this same draft after this one loaded.
  // Carrying on typing would quietly overwrite it, so ask first.
  useEffect(() => {
    if (!enabled || !hydratedRef.current || !stored) return;
    if (stored.updatedAt <= hydratedAt.current) return;
    const { data } = stored;
    if (
      data === lastSaved.current ||
      data === latest.current.serialized ||
      recentWrites.current.includes(data)
    ) {
      return;
    }
    setOffer({ data, savedAt: stored.updatedAt, remote: true });
  }, [enabled, stored]);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!hydratedRef.current) return;
    const { serialized, value, surface, subjectKey, isEmpty } = latest.current;
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    recentWrites.current = [...recentWrites.current.slice(-4), serialized];
    if (failures.current === 0) setStatus("saving");
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
      failures.current = 0;
    } catch {
      // Retry on a timer, backing off. Waiting for the next keystroke left a
      // draft unsaved for good once someone had stopped typing.
      lastSaved.current = null;
      failures.current += 1;
      setStatus("error");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => void flushRef.current(),
        Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failures.current - 1)),
      );
    }
  }, [saveDraft, discardDraft]);
  flushRef.current = flush;

  useEffect(() => {
    if (!enabled || !hydrated || serialized === lastSaved.current) return;
    setOffer(null);
    if (failures.current === 0) setStatus("pending");
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

  const unsaved = status === "pending" || status === "saving" || status === "error";
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
      failures.current = 0;
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
    offer: offer ? { savedAt: offer.savedAt, remote: offer.remote } : null,
    acceptOffer: () => {
      if (offer) apply(offer.data, offer.savedAt);
      setOffer(null);
    },
    declineOffer: () => {
      const remote = offer?.remote;
      setOffer(null);
      if (remote) {
        // Keeping this tab's version means writing it back over the other one.
        lastSaved.current = null;
        void flush();
      } else {
        void clear();
      }
    },
    clear,
    hydrated,
  };
}
