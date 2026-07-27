"use client";

/* eslint-disable react-refresh/only-export-components --
   Context provider colocated with its hook (useAcademySession), matching
   components/providers/current-user.tsx's convention. */
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

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
  loginParticipant: (p: ParticipantSession) => void;
  loginAdmin: () => void;
  logout: () => void;
}

const STORAGE_KEY = "wallbox-academy-session";
const AcademySessionContext = createContext<AcademySessionValue | null>(null);

interface StoredSession {
  participant: ParticipantSession | null;
  isAdminSession: boolean;
}

/**
 * Who's "logged in" to this code/PIN-gated academy right now — kept in
 * `sessionStorage` (not a real account session) so real Next.js navigation
 * between the academy's routes, and a same-tab reload, don't force
 * re-entering the code or PIN. Cleared when the tab closes, same as the
 * original tool never persisting a login across a full app restart.
 */
export function AcademySessionProvider({ children }: { children: ReactNode }) {
  const [participant, setParticipant] = useState<ParticipantSession | null>(
    null
  );
  const [isAdminSession, setIsAdminSession] = useState(false);
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
    persist({ participant: p, isAdminSession: false });
  }

  function loginAdmin() {
    setIsAdminSession(true);
    setParticipant(null);
    persist({ participant: null, isAdminSession: true });
  }

  function logout() {
    setParticipant(null);
    setIsAdminSession(false);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AcademySessionContext.Provider
      value={{
        hydrated,
        participant,
        isAdminSession,
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
    throw new Error(
      "useAcademySession must be used within AcademySessionProvider"
    );
  }
  return ctx;
}
