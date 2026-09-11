"use client";

import { useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { DesignFeedbackDialog } from "@/components/design/DesignFeedbackDialog";

/** Distinct pages seen with the refreshed design before the question comes —
 * enough to have an opinion, early enough that it's still fresh. */
const PAGES_BEFORE_PROMPT = 3;

/**
 * Asks for feedback exactly once. It's recorded as asked the moment it
 * shows, so answering, dismissing and simply ignoring it all end it for good.
 */
export function DesignFeedbackPrompt() {
  const t = useTranslations("Design");
  const pathname = usePathname();
  const prefs = useQuery(api.userPreferences.getMine);
  const setPrefs = useMutation(api.userPreferences.setMine);
  const [dialogOpen, setDialogOpen] = useState(false);
  const visited = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const eligible = prefs?.designPreview === "refreshed" && !prefs.designFeedbackPromptedAt;

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!eligible || timer.current) return;
    visited.current.add(pathname);
    if (visited.current.size < PAGES_BEFORE_PROMPT) return;
    // A short pause so it doesn't land on top of the page that just opened.
    timer.current = setTimeout(() => {
      void setPrefs({ designFeedbackPromptedAt: Date.now() });
      toast(t("promptTitle"), {
        duration: 15_000,
        action: { label: t("promptAction"), onClick: () => setDialogOpen(true) },
      });
    }, 1500);
  }, [eligible, pathname, setPrefs, t]);

  return <DesignFeedbackDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
}
