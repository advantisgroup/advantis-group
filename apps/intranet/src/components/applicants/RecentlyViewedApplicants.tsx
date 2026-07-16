"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { History } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getRecentlyViewed,
  type RecentApplicant,
} from "@/lib/applicant-recent";

/** Small popover listing the last few applicants viewed on this browser
 * (localStorage only — not synced across devices or users). */
export function RecentlyViewedApplicants({
  excludeId,
}: {
  excludeId?: string;
}) {
  const t = useTranslations("Applicants");
  const router = useRouter();
  const [recent, setRecent] = useState<RecentApplicant[]>([]);
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setRecent(getRecentlyViewed());
  }

  const visible = recent.filter(r => r.id !== excludeId);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("recentlyViewed")}>
          <History className="size-4" />
          <span className="hidden md:inline">{t("recentlyViewed")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t("recentlyViewedEmpty")}
          </p>
        ) : (
          <div className="space-y-0.5">
            {visible.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/applicants/${r.id}/uebersicht`);
                }}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
