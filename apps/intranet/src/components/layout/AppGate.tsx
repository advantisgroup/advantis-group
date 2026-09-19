"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";

import { StepUpScreen } from "@/components/auth/StepUpScreen";
import { AppShell } from "@/components/layout/AppShell";
import { RequestAccessGate } from "@/components/layout/RequestAccessGate";
import { BrandLogo } from "@/components/Logo";
import { type CurrentUser, CurrentUserProvider } from "@/components/providers/current-user";
import { ConfirmProvider } from "@/components/ui/dialog";

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse opacity-70">
        <BrandLogo />
      </div>
    </div>
  );
}

export function AppGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const ensure = useMutation(api.people.users.ensureCurrentUser);
  const me = useQuery(api.people.users.me);
  const ensured = useRef(false);
  const deviceEvaluated = useRef<string | null>(null);

  // Wait for Clerk's own user object to report a primary email, not just
  // isSignedIn — right after accepting an invite (especially via OAuth), a
  // session can exist a moment before the convex JWT template's `email`
  // claim catches up. Calling ensureUser with that claim still empty makes
  // it miss a real pending invite, and since this only ever runs once, it
  // never gets a second chance.
  useEffect(() => {
    if (!ensured.current && isSignedIn && userLoaded && user?.primaryEmailAddress) {
      ensured.current = true;
      void ensure({});
    }
  }, [ensure, isSignedIn, userLoaded, user]);

  // One-shot per Clerk session — feeds the "new device" risk signal
  // `resolveSignInRequirement` reads. Best-effort: a failed call just means
  // no risk signal is recorded for this session, never a hard failure.
  useEffect(() => {
    if (!isSignedIn || !sessionId || deviceEvaluated.current === sessionId) return;
    deviceEvaluated.current = sessionId;
    void (async () => {
      const token = await getToken();
      await fetch(`${apiUrl}/auth/step-up/evaluate-device`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
    })();
  }, [isSignedIn, sessionId, getToken]);

  const stepUpStatus = useQuery(
    api.security.stepUp.status,
    me && sessionId ? { sessionId } : "skip",
  );
  const gateRequired =
    !!stepUpStatus &&
    (stepUpStatus.state === "needs_verification" || stepUpStatus.state === "needs_enrollment");
  const [gateDismissed, setGateDismissed] = useState(false);

  // A fresh requirement (a brand new session, or policy tightening mid-use)
  // always re-arms the gate, even if an earlier one was already dismissed.
  useEffect(() => {
    if (gateRequired) setGateDismissed(false);
  }, [gateRequired]);

  // Clerk itself hasn't resolved auth state yet — never trust `me` until it has,
  // otherwise a transiently-unauthenticated Convex query flashes Request Access.
  if (!isLoaded) return <FullScreenLoader />;
  if (!isSignedIn) return <FullScreenLoader />;

  if (me === undefined) return <FullScreenLoader />;
  if (me === null) return <RequestAccessGate />;

  if (stepUpStatus === undefined) return <FullScreenLoader />;
  if (gateRequired && !gateDismissed) {
    return (
      <CurrentUserProvider user={me as CurrentUser}>
        <StepUpScreen status={stepUpStatus} onDismiss={() => setGateDismissed(true)} />
      </CurrentUserProvider>
    );
  }

  return (
    <CurrentUserProvider user={me as CurrentUser}>
      <ConfirmProvider>
        <AppShell>{children}</AppShell>
      </ConfirmProvider>
    </CurrentUserProvider>
  );
}
