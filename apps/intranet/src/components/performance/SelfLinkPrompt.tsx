"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Link2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { dismissLinkPrompt, isLinkPromptDismissed } from "@/lib/performanceAuth";

/**
 * Self-service prompt shown after a real password login (never for one
 * already resolved via a Clerk link — see `myLinkableClerkIdentity`): offers
 * to link the login to the signed-in intranet account so it works without a
 * password next time. Renders nothing until the query resolves eligible and
 * the admin hasn't already dismissed it once for this login on this
 * browser.
 */
export function SelfLinkPrompt({ token }: { token: string }) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const identity = useQuery(api.performanceAuth.myLinkableClerkIdentity, {
    token,
  });
  const linkMyAccount = useMutation(api.performanceAuth.linkMyAccount);
  const [linking, setLinking] = useState(false);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (!identity?.eligible) return null;
  if (dismissedNow || isLinkPromptDismissed(identity.loginId)) return null;

  async function handleLink() {
    if (!identity?.eligible) return;
    setLinking(true);
    try {
      await linkMyAccount({ token });
      toast.success(t("linkPromptSuccess"));
    } catch (err) {
      handleError(err);
    } finally {
      setLinking(false);
    }
  }

  function handleDismiss() {
    if (identity?.eligible) dismissLinkPrompt(identity.loginId);
    setDismissedNow(true);
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <Link2 className="h-4 w-4 shrink-0 text-primary" />
        <p className="flex-1 text-sm">
          {t("linkPromptBody", {
            name: identity.name,
            email: identity.email,
          })}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={linking} onClick={() => void handleLink()}>
            {t("linkPromptConfirm")}
          </Button>
          <Button variant="ghost" size="sm" disabled={linking} onClick={handleDismiss}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("linkPromptDismiss")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
