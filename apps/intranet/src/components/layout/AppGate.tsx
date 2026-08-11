"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { api } from "@advantis/convex/api";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";

import { AppShell } from "@/components/layout/AppShell";
import { RequestAccessGate } from "@/components/layout/RequestAccessGate";
import { BrandLogo } from "@/components/Logo";
import { type CurrentUser, CurrentUserProvider } from "@/components/providers/current-user";
import { ConfirmProvider } from "@/components/ui/dialog";

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
  const { isLoaded, isSignedIn } = useAuth();
  const ensure = useMutation(api.users.ensureCurrentUser);
  const me = useQuery(api.users.me);
  const ensured = useRef(false);

  useEffect(() => {
    if (!ensured.current && isSignedIn) {
      ensured.current = true;
      void ensure({});
    }
  }, [ensure, isSignedIn]);

  // Clerk itself hasn't resolved auth state yet — never trust `me` until it has,
  // otherwise a transiently-unauthenticated Convex query flashes Request Access.
  if (!isLoaded) return <FullScreenLoader />;
  if (!isSignedIn) return <FullScreenLoader />;

  if (me === undefined) return <FullScreenLoader />;
  if (me === null) return <RequestAccessGate />;

  return (
    <CurrentUserProvider user={me as CurrentUser}>
      <ConfirmProvider>
        <AppShell>{children}</AppShell>
      </ConfirmProvider>
    </CurrentUserProvider>
  );
}
