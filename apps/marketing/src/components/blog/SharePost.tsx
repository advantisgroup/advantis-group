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

  // Read straight from the browser rather than via an effect: the dialog's
  // contents only mount once it's opened, long after hydration, so there's no
  // server/client mismatch to worry about — and no frame where the URL renders
  // as a bare path.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const referral = useQuery(api.sharing.myReferralState, {});
  const setReferralSharing = useMutation(api.sharing.setReferralSharing);

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

        <div className="space-y-3">
          {/* A wrapping block, not an <input>: a single-line field silently
              clips the end of the URL, which is the one thing this dialog
              exists to show. `break-all` keeps even the long fallback URL
              fully visible. */}
          <p
            aria-label={t("linkLabel")}
            className="select-all break-all rounded-lg border border-rule bg-card px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground"
          >
            {shareUrl || " "}
          </p>
          <Button type="button" className="w-full gap-2 rounded-lg" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>

        {referral?.available ? (
          <label className="flex cursor-pointer items-start gap-3 border-t border-rule pt-5">
            <Switch
              checked={referral.enabled}
              onCheckedChange={(enabled) => {
                void setReferralSharing({ enabled }).catch(() => {});
              }}
              aria-label={t("referral.label")}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {t("referral.label")}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {t("referral.hint")}
              </span>
            </span>
          </label>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
