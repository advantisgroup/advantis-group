"use client";

import type { ReactNode } from "react";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "@advantis/convex/api";

import { AppShell } from "@/components/layout/AppShell";
import { RequestAccessGate } from "@/components/layout/RequestAccessGate";
import {
  type CurrentUser,
  CurrentUserProvider,
} from "@/components/providers/current-user";
import { BrandLogo } from "@/components/Logo";

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
  const ensure = useMutation(api.users.ensureCurrentUser);
  const me = useQuery(api.users.me);
  const ensured = useRef(false);

  useEffect(() => {
    if (!ensured.current) {
      ensured.current = true;
      void ensure({});
    }
  }, [ensure]);

  if (me === undefined) return <FullScreenLoader />;
  if (me === null) return <RequestAccessGate />;

  return (
    <CurrentUserProvider user={me as CurrentUser}>
      <AppShell>{children}</AppShell>
    </CurrentUserProvider>
  );
}
