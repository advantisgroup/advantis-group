"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { AnimatePresence, motion } from "framer-motion";
import { Cookie } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getConsent, setConsent } from "@/lib/consent";
import { isAuthRoute } from "@/lib/utils";

/**
 * `instrumentation-client.ts` initialises PostHog with
 * `opt_out_capturing_by_default: true`, so nothing is captured until one of
 * the two buttons here calls `opt_in_capturing`/`opt_out_capturing` — both
 * persist the choice (PostHog stores it in localStorage), so a returning
 * visitor who already decided never sees this again.
 */
export const CookieBanner = () => {
  const t = useTranslations("cookieBanner");
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === "pending") {
      setVisible(true);
    }
  }, []);

  const decide = (accepted: boolean) => {
    setConsent(accepted);
    setVisible(false);
  };

  // Same shell as the auth pages — no chrome, so no banner either.
  if (isAuthRoute(pathname)) return null;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          role="dialog"
          aria-label={t("title")}
          className="fixed inset-x-5 bottom-5 z-[80] mx-auto max-w-md rounded-xl border border-rule bg-card/95 p-5 shadow-2xl shadow-black/20 backdrop-blur-md sm:inset-x-auto sm:left-5"
        >
          <div className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Cookie className="size-4" />
            </span>
            <div>
              <p className="font-[family-name:var(--font-outfit)] text-sm font-bold tracking-[-0.01em]">
                {t("title")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {t("description")}{" "}
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {t("privacyLink")}
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button size="sm" className="flex-1 rounded-lg" onClick={() => decide(true)}>
              {t("accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 rounded-lg border-rule-strong"
              onClick={() => decide(false)}
            >
              {t("reject")}
            </Button>
          </div>

          {/* Leaves the choice pending on purpose — the banner is still there
              when they come back, and /cookies is where they actually pick. */}
          <Link
            href="/cookies"
            className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("manage")}
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
