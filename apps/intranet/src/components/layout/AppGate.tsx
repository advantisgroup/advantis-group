"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useAuth, useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

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
  const { isAuthenticated: convexReady } = useConvexAuth();
  const me = useQuery(api.people.users.me);
  const ensured = useRef(false);
  const [ensureDone, setEnsureDone] = useState(false);
  const deviceEvaluated = useRef<string | null>(null);

  // Wait for Clerk's own user object to report a primary email, not just
  // isSignedIn — right after accepting an invite (especially via OAuth), a
  // session can exist a moment before the convex JWT template's `email`
  // claim catches up. Calling ensureUser with that claim still empty makes
  // it miss a real pending invite. Also wait until Convex has the token:
  // run before that, the call is anonymous and comes back "unauthenticated",
  // which used to leave a member on "Zugang anfragen" until they pressed F5.
  useEffect(() => {
    if (ensured.current || !convexReady || !isSignedIn || !userLoaded) return;
    if (!user?.primaryEmailAddress) return;
    ensured.current = true;
    void ensure({})
      .then((result) => {
        // Token not attached yet after all — let the next render try again.
        if (result?.status === "unauthenticated") ensured.current = false;
        else setEnsureDone(true);
      })
      .catch(() => setEnsureDone(true));
  }, [ensure, convexReady, isSignedIn, userLoaded, user]);

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

  if (!convexReady || me === undefined) return <FullScreenLoader />;
  // Only say "no access" once the server has had its chance to link the
  // account; until then a null `me` just means "not provisioned yet".
  if (me === null) return ensureDone ? <RequestAccessGate /> : <FullScreenLoader />;

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
