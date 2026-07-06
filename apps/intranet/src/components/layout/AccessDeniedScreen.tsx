"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { useClerk, useUser } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/Logo";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

/**
 * Shown when a signed-in Clerk identity's email domain sits outside the
 * intranet allowlist — there is no path to access, ever, so instead of
 * leaving the account in permanent limbo we remove it automatically.
 */
export function AccessDeniedScreen() {
  const t = useTranslations("AccessDenied");
  const { user } = useUser();
  const { signOut } = useClerk();
  const selfDelete = useAction(api.accessRequests.selfDeleteUnauthorized);
  const started = useRef(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      setRemoving(true);
      try {
        await selfDelete({});
      } catch {
        // Best-effort: the account may already be gone, or the call
        // failed transiently — signing out below still ends the session.
      } finally {
        await signOut({ redirectUrl: "/sign-up" });
      }
    })();
  }, [selfDelete, signOut]);

  return (
    <div className="app-atmosphere relative flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden border-destructive/30">
        <div className="flex flex-col items-center gap-4 border-b border-border/60 px-6 pb-6 pt-8 text-center">
          <BrandLogo />
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="size-7 text-destructive" />
          </div>
          <div>
            <CardTitle className="font-display text-xl">
              {t("title")}
            </CardTitle>
            {email && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t("signedInAs")}{" "}
                <span className="font-medium text-foreground">{email}</span>
              </p>
            )}
          </div>
        </div>
        <CardContent className="space-y-4 pt-6 text-center">
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80">
            <span className="size-1.5 animate-pulse rounded-full bg-destructive/70" />
            {removing ? t("removing") : t("autoRemoveNotice")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
