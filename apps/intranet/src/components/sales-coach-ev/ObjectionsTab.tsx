"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { OBJECTIONS } from "./constants";

export function ObjectionsTab({ detectedId }: { detectedId: string | null }) {
  const t = useTranslations("SalesCoachEv");
  const [openId, setOpenId] = useState<string | null>(detectedId);

  useEffect(() => {
    if (detectedId) setOpenId(detectedId);
  }, [detectedId]);

  return (
    <div className="flex-1 overflow-y-auto p-2.5">
      {detectedId && (
        <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[13px] font-semibold text-amber-700 dark:text-amber-400">
          {t("objectionDetected")}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {OBJECTIONS.map((o) => {
          const open = openId === o.id;
          return (
            <div
              key={o.id}
              onClick={() => setOpenId(open ? null : o.id)}
              role="button"
              tabIndex={0}
              className={cn(
                "cursor-pointer rounded-lg border border-border bg-muted/40 p-2.5 transition-colors hover:border-primary",
                open && "border-primary bg-primary/5",
              )}
            >
              <div className="text-[13px] font-semibold text-foreground/90">{o.q}</div>
              {open && <div className="mt-1.5 text-[13px] leading-relaxed text-foreground/80">{o.a}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
