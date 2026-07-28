"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { type Id } from "@advantis/convex/dataModel";

export interface ParticipantSession {
  id: Id<"academyParticipants">;
  name: string;
}

interface AcademySessionValue {
  /** False until the first read from sessionStorage completes, so routes
   * don't flash a "please log in" redirect before we know the real state. */
  hydrated: boolean;
  participant: ParticipantSession | null;
  isAdminSession: boolean;
  /** The PIN that unlocked this admin session — sent back to the server on
   * every Trainer-area mutation, which re-verifies it (or the real-admin
   * bypass) itself rather than trusting this boolean alone. Empty for a real
   * intranet admin's bypass login, since the server checks their role first
   * and never reads this value in that case. */
  academyPin: string;
  loginParticipant: (p: ParticipantSession) => void;
  loginAdmin: (pin?: string) => void;
  logout: () => void;
}

const STORAGE_KEY = "wallbox-academy-session";
const AcademySessionContext = createContext<AcademySessionValue | null>(null);

interface StoredSession {
  participant: ParticipantSession | null;
  isAdminSession: boolean;
  academyPin: string;
}

/**
 * Who's "logged in" to this code/PIN-gated academy right now — kept in
 * `sessionStorage` (not a real account session) so real Next.js navigation
 * between the academy's routes, and a same-tab reload, don't force
 * re-entering the code or PIN. Cleared when the tab closes, same as the
 * original tool never persisting a login across a full app restart.
 */
export function AcademySessionProvider({ children }: { children: ReactNode }) {
  const [participant, setParticipant] = useState<ParticipantSession | null>(null);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [academyPin, setAcademyPin] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredSession>;
        // One-shot hydration from storage on mount, same pattern as
        // hooks/use-deep-link-id.ts and lib/activity/useQueryParam.ts.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.participant) setParticipant(parsed.participant);
        if (parsed.isAdminSession) setIsAdminSession(true);
        if (parsed.academyPin) setAcademyPin(parsed.academyPin);
      }
    } catch {
      // ignore malformed/inaccessible storage
    }
    setHydrated(true);
  }, []);

  function persist(next: StoredSession) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function loginParticipant(p: ParticipantSession) {
    setParticipant(p);
    setIsAdminSession(false);
    setAcademyPin("");
    persist({ participant: p, isAdminSession: false, academyPin: "" });
  }

  function loginAdmin(pin = "") {
    setIsAdminSession(true);
    setParticipant(null);
    setAcademyPin(pin);
    persist({ participant: null, isAdminSession: true, academyPin: pin });
  }

  function logout() {
    setParticipant(null);
    setIsAdminSession(false);
    setAcademyPin("");
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AcademySessionContext.Provider
      value={{
        hydrated,
        participant,
        isAdminSession,
        academyPin,
        loginParticipant,
        loginAdmin,
        logout,
      }}
    >
      {children}
    </AcademySessionContext.Provider>
  );
}

export function useAcademySession(): AcademySessionValue {
  const ctx = useContext(AcademySessionContext);
  if (!ctx) {
    throw new Error("useAcademySession must be used within AcademySessionProvider");
  }
  return ctx;
}
