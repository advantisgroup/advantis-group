"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

/**
 * Share sheet for a blog post: the short `/share/blog/{code}` link, and — for
 * a signed-in colleague — one toggle that decides whether the link credits
 * them for whoever it brings in.
 *
 * The toggle is deliberately *here* rather than in a settings page: it's a
 * decision that only makes sense at the moment you're creating a link, and
 * asking it anywhere else turns a two-second action into a configuration
 * chore. It's remembered after the first time, so it's asked once.
 *
 * Signed out (or an account the org has no record of) → no toggle at all,
 * because there'd be nobody to credit and a dead control is worse than none.
 */
export function SharePost({ shareCode, longPath }: { shareCode: string | null; longPath: string }) {
  const t = useTranslations("blog.share");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  const referral = useQuery(api.sharing.myReferralState, {});
  const setReferralSharing = useMutation(api.sharing.setReferralSharing);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Default-on only becomes real the first time someone opens the sheet —
  // that's when the code gets minted, so nobody who never shares ends up
  // with a referral code written to their account.
  useEffect(() => {
    if (!open || !referral?.available) return;
    if (referral.enabled && !referral.code) {
      void setReferralSharing({ enabled: true }).catch(() => {});
    }
  }, [open, referral, setReferralSharing]);

  const referralOn = Boolean(referral?.available && referral.enabled && referral.code);
  const shareUrl = shareCode
    ? `${origin}/share/blog/${shareCode}${referralOn ? `?r=${referral?.code}` : ""}`
    : `${origin}${longPath}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, denied permission) — the link is
      // selectable in the field either way.
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-lg">
          <Share2 className="size-4" />
          {t("action")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label={t("linkLabel")}
            className="min-w-0 flex-1 rounded-lg border border-rule bg-background px-3 py-2 font-mono text-sm text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="button" size="sm" className="shrink-0 gap-1.5 rounded-lg" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>

        {referral?.available ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rule bg-card p-3">
            <Switch
              checked={referral.enabled}
              onCheckedChange={(enabled) => {
                void setReferralSharing({ enabled }).catch(() => {});
              }}
              aria-label={t("referral.label")}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {t("referral.label")}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {t("referral.hint")}
              </span>
            </span>
          </label>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
