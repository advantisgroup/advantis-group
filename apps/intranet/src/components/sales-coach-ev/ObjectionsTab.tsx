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
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {detectedId && (
        <p className="mb-2 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] font-medium">
          <span className="size-1.5 rounded-full bg-warning" />
          {t("objectionDetected")}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {OBJECTIONS.map((o) => {
          const open = openId === o.id;
          return (
            <div
              key={o.id}
              onClick={() => setOpenId(open ? null : o.id)}
              role="button"
              tabIndex={0}
              className={cn(
                "cursor-pointer rounded-xl border border-border/70 bg-card px-3.5 py-2.5 transition-colors hover:border-border",
                open && "border-foreground/25",
              )}
            >
              <div className="text-[13.5px] font-medium">„{o.q}"</div>
              {open && (
                <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  {o.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
