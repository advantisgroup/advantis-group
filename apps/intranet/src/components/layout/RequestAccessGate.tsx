"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Clock, ShieldX } from "lucide-react";
import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { BrandLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function RequestAccessGate() {
  const t = useTranslations("Access");
  const { user } = useUser();
  const status = useQuery(api.accessRequests.myStatus);
  const requestAccess = useMutation(api.accessRequests.create);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  async function submit() {
    setSubmitting(true);
    try {
      await requestAccess({ message: message.trim() || undefined });
      toast.success(t("pending"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  const state = status?.status ?? "none";
  const domainAllowed = status && "domainAllowed" in status ? status.domainAllowed : true;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <BrandLogo className="mb-4" />
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("signedInAs")} <span className="font-medium text-foreground">{email}</span>
          </p>

          {state === "pending" && (
            <div className="flex items-start gap-3 rounded-lg border bg-background p-4 text-sm">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <span>{t("pending")}</span>
            </div>
          )}

          {state === "denied" && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <span>{t("denied")}</span>
            </div>
          )}

          {state === "none" && (
            <>
              <p className="text-sm text-muted-foreground">{t("intro")}</p>
              {domainAllowed ? (
                <>
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
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {t("domainBlocked")}
                </div>
              )}
            </>
          )}

          <SignOutButton>
            <Button variant="ghost" className="w-full">
              Sign out
            </Button>
          </SignOutButton>
        </CardContent>
      </Card>
    </div>
  );
}
