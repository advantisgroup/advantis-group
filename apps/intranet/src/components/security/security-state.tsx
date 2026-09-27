"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@clerk/nextjs";

import { ApiResponseError } from "@/lib/api-client";

export type Passkey = {
  _id: string;
  name: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export type TotpState = {
  enrolled: boolean;
  needsRotation: boolean;
  recoveryCodesRemaining: number;
  recoveryCodesTotal: number;
};

export type SecondaryEmail = {
  _id: string;
  email: string;
  verified: boolean;
  addedAt: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

/** Throws an `ApiResponseError` carrying the API's error code, so callers can
 * pick localised copy for it instead of showing the server's own text. */
export async function jsonOrThrow(response: Response) {
  const body = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) throw new ApiResponseError(body);
  return body as { message?: string };
}

interface SecurityState {
  passkeys: Passkey[] | null;
  totp: TotpState | null;
  secondaryEmails: SecondaryEmail[] | null;
  /** True until all endpoints have answered once. */
  loading: boolean;
  refresh: () => Promise<void>;
  apiRequest: (path: string, init?: RequestInit) => Promise<Response>;
}

const SecurityStateContext = createContext<SecurityState | null>(null);

/**
 * One fetch of "what protects this account", shared by the posture header and
 * both method cards.
 *
 * They used to each call the API themselves — the passkey card, the TOTP card
 * and the preference card all hitting `/passkeys` or `/mfa/totp/status` on
 * mount. Beyond the duplicate requests, nothing kept them in step: adding a
 * passkey refreshed one list and left the others describing an account that no
 * longer existed. A header that scores your security is only worth having if
 * it can't disagree with the cards underneath it.
 */
export function SecurityStateProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [totp, setTotp] = useState<TotpState | null>(null);
  const [secondaryEmails, setSecondaryEmails] = useState<SecondaryEmail[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  const apiRequest = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      return await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          ...init?.headers,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [getToken],
  );

  const refresh = useCallback(async () => {
    // Settled, not all: one endpoint being down shouldn't blank the other's
    // card. Whichever answers, renders.
    const [passkeyResult, totpResult, secondaryEmailResult] = await Promise.allSettled([
      jsonOrThrow(await apiRequest("/passkeys")) as Promise<{ passkeys: Passkey[] }>,
      jsonOrThrow(await apiRequest("/mfa/totp/status")) as Promise<TotpState>,
      jsonOrThrow(await apiRequest("/secondary-emails")) as Promise<{
        secondaryEmails: SecondaryEmail[];
      }>,
    ]);
    if (passkeyResult.status === "fulfilled") setPasskeys(passkeyResult.value.passkeys);
    if (totpResult.status === "fulfilled") setTotp(totpResult.value);
    if (secondaryEmailResult.status === "fulfilled") {
      setSecondaryEmails(secondaryEmailResult.value.secondaryEmails);
    }
    setLoaded(true);
  }, [apiRequest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ passkeys, totp, secondaryEmails, loading: !loaded, refresh, apiRequest }),
    [passkeys, totp, secondaryEmails, loaded, refresh, apiRequest],
  );

  return <SecurityStateContext.Provider value={value}>{children}</SecurityStateContext.Provider>;
}

export function useSecurityState(): SecurityState {
  const state = useContext(SecurityStateContext);
  if (!state) throw new Error("useSecurityState must be used inside <SecurityStateProvider>");
  return state;
}

// --- Posture scoring ---------------------------------------------------------

export type PostureTier = "exposed" | "basic" | "strong" | "maximum";

export interface Posture {
  tier: PostureTier;
  /** 0–1, what the meter fills to. */
  score: number;
  hasPasskey: boolean;
  hasTotp: boolean;
  /** Enrolled, but a spent recovery code means the device is presumed lost. */
  totpNeedsRotation: boolean;
  /** The single most useful thing this account could do next, or null. */
  nextStep: "passkey" | "totp" | "rotate" | null;
}

/**
 * Deliberately ranks a passkey above an authenticator app rather than
 * counting factors: a passkey is phishing-resistant and a typed code is not,
 * so "password + TOTP" is not the same account security as "passkey", even
 * though both are two things.
 */
export function scorePosture(passkeys: Passkey[] | null, totp: TotpState | null): Posture {
  const hasPasskey = (passkeys?.length ?? 0) > 0;
  const totpNeedsRotation = totp?.needsRotation === true;
  const hasTotp = totp?.enrolled === true && !totpNeedsRotation;

  const tier: PostureTier =
    hasPasskey && hasTotp ? "maximum" : hasPasskey ? "strong" : hasTotp ? "basic" : "exposed";
  const score = { exposed: 0.16, basic: 0.5, strong: 0.78, maximum: 1 }[tier];

  return {
    tier,
    score,
    hasPasskey,
    hasTotp,
    totpNeedsRotation,
    nextStep: totpNeedsRotation ? "rotate" : !hasPasskey ? "passkey" : !hasTotp ? "totp" : null,
  };
}
