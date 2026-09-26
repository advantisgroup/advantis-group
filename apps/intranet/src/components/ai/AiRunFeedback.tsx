"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** "Was this any good?" for one run — the thumbs, and a note when it wasn't. */
export function AiRunFeedback({ runId }: { runId: Id<"aiRuns"> }) {
  const t = useTranslations("Ai");
  const saved = useQuery(api.aiRuns.myFeedback, { runId });
  const rateRun = useMutation(api.aiRuns.rateRun);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    setNote(saved?.note ?? "");
    setNoteSaved(false);
  }, [saved?.note, runId]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(["up", "down"] as const).map((rating) => {
          const Icon = rating === "up" ? ThumbsUp : ThumbsDown;
          const active = saved?.rating === rating;
          return (
            <Button
              key={rating}
              variant="outline"
              size="sm"
              aria-pressed={active}
              // Unmistakably picked: a tinted fill and a filled icon in the
              // rating's own colour. The old two-percent wash on the border
              // left people unsure the click had registered at all.
              className={cn(
                active &&
                  (rating === "up"
                    ? "border-success/40 bg-success/10 text-success hover:bg-success/15 hover:text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"),
              )}
              onClick={() => void rateRun({ runId, rating, note: note || undefined })}
            >
              <Icon className={cn(active && "fill-current")} />
              {t(`feedback.${rating}`)}
              {active && <Check className="size-3.5 opacity-80" />}
            </Button>
          );
        })}
      </div>
      {saved?.rating === "down" && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteSaved(false);
            }}
            placeholder={t("feedback.notePlaceholder")}
            className="min-h-[72px]"
          />
          <div className="flex items-center justify-end gap-2">
            {noteSaved && (
              <span className="text-xs text-muted-foreground">{t("feedback.saved")}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void rateRun({ runId, rating: "down", note }).then(() => setNoteSaved(true));
              }}
            >
              {t("feedback.save")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
