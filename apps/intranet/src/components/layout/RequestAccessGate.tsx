"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Clock, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AccessDeniedScreen } from "@/components/layout/AccessDeniedScreen";
import { BrandLogo } from "@/components/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";

export function RequestAccessGate() {
  const t = useTranslations("Access");
  const tNav = useTranslations("Nav");
  const { user, isLoaded } = useUser();
  const status = useQuery(api.accessRequests.myStatus);
  const requestAccess = useMutation(api.accessRequests.create);
  const handleError = useErrorHandler();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const email = isLoaded ? (user?.primaryEmailAddress?.emailAddress ?? "") : "";

  async function submit() {
    setSubmitting(true);
    try {
      await requestAccess({ message: message.trim() || undefined });
      toast.success(t("pending"));
    } catch (e) {
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  const state = status?.status ?? "none";
  const domainAllowed = status && "domainAllowed" in status ? status.domainAllowed : true;

  // A blocked domain can never gain access — no request form, no limbo.
  if (status && state === "none" && !domainAllowed) {
    return <AccessDeniedScreen />;
  }

  // The convex JWT's email claim can briefly lag behind a just-created
  // Clerk account (e.g. right after accepting an invite via OAuth) — myStatus
  // reports no email yet. Wait rather than offering a request button that's
  // just going to throw "no email address"; the query is live and re-renders
  // itself once the claim catches up.
  if (status && state === "none" && !status.email) {
    return (
      <div className="app-atmosphere relative flex min-h-screen items-center justify-center p-4">
        <div className="animate-pulse opacity-70">
          <BrandLogo />
        </div>
      </div>
    );
  }

  return (
    <div className="app-atmosphere relative flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="flex flex-col items-center gap-4 border-b border-border/60 px-6 pb-5 pt-7 text-center">
          <BrandLogo />
          <div>
            <CardTitle className="font-display text-xl">{t("title")}</CardTitle>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("signedInAs")} <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>
        </div>
        <CardContent className="space-y-4 pt-5">
          {state === "pending" && (
            <Alert variant="warning">
              <Clock />
              <AlertDescription>{t("pending")}</AlertDescription>
            </Alert>
          )}

          {state === "denied" && (
            <Alert variant="destructive">
              <ShieldX />
              <AlertDescription>{t("denied")}</AlertDescription>
            </Alert>
          )}

          {state === "none" && (
            <>
              <p className="text-sm text-muted-foreground">{t("intro")}</p>
              <Textarea
                placeholder={t("messageLabel")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
              <Button className="w-full" onClick={submit} disabled={submitting}>
                {t("requestButton")}
              </Button>
            </>
          )}

          <SignOutButton>
            <Button variant="ghost" className="w-full">
              {tNav("signOut")}
            </Button>
          </SignOutButton>
        </CardContent>
      </Card>
    </div>
  );
}
