"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface AskSubject {
  type: "itTicket" | "applicant" | "announcement" | "errorReport" | "suggestion";
  id: string;
  /** Shown in the panel header while the real title is still loading. */
  label: string;
}

interface AskStore {
  /** What the page currently has open — what ⌘K offers to ask about. */
  subject: AskSubject | null;
  setSubject: (subject: AskSubject | null) => void;
  open: AskSubject | null;
  setOpen: (subject: AskSubject | null) => void;
}

const AskContext = createContext<AskStore | null>(null);

export function AskProvider({ children }: { children: ReactNode }) {
  const [subject, setSubject] = useState<AskSubject | null>(null);
  const [open, setOpen] = useState<AskSubject | null>(null);
  const value = useMemo(() => ({ subject, setSubject, open, setOpen }), [subject, open]);
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

function useAskStore(): AskStore | null {
  return useContext(AskContext);
}

/**
 * Tells the app what this page (or its open detail panel) is about, so the
 * command palette can offer to ask about it. Registering the same subject
 * twice is harmless; unmounting clears it.
 */
export function useAskSubject(subject: AskSubject | null) {
  const store = useAskStore();
  const setSubject = store?.setSubject;
  const key = subject ? `${subject.type}:${subject.id}:${subject.label}` : null;

  useEffect(() => {
    if (!setSubject) return;
    setSubject(subject);
    return () => setSubject(null);
    // `key` stands in for the subject's identity — a fresh object each render
    // would otherwise re-register on every one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSubject, key]);
}

/** Opens the ask panel — for an explicit record, or for whatever the page
 * registered. Returns null when there's nothing to ask about. */
export function useAsk() {
  const store = useAskStore();
  const pageSubject = store?.subject ?? null;
  const setOpen = store?.setOpen;
  const ask = useCallback(
    (subject?: AskSubject) => {
      const target = subject ?? pageSubject;
      if (target) setOpen?.(target);
    },
    [pageSubject, setOpen],
  );
  return { ask, pageSubject, canAsk: !!pageSubject };
}

/** For the panel itself. */
export function useAskOpen() {
  const store = useAskStore();
  return { open: store?.open ?? null, close: () => store?.setOpen(null) };
}
