"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useIsManager } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";
import { useErrorHandler } from "@/hooks/use-error-handler";

/** Every "new wiki entry" gets its own draft box immediately, so it has a
 *  real id to live at before anything's even been typed — this page's only
 *  job is to create one and hand off to it. */
export default function NewGuidebookPage() {
  const t = useTranslations("Guidebooks");
  const isManager = useIsManager();
  const router = useRouter();
  const createDraft = useMutation(api.drafts.create);
  const handleError = useErrorHandler();
  const started = useRef(false);

  useEffect(() => {
    if (!isManager || started.current) return;
    started.current = true;
    createDraft({ surface: "wikiEntry" })
      .then((draftId) => router.replace(`/guidebooks/draft/${draftId}`))
      .catch((e) => {
        handleError(e);
        started.current = false;
      });
  }, [isManager, createDraft, router, handleError]);

  if (!isManager) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {t("noAccess")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
