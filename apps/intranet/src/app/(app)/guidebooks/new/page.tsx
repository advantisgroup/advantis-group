"use client";

import { useTranslations } from "next-intl";

import { NewDraftRedirect } from "@/components/compose/NewDraftRedirect";
import { useIsManager } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function NewGuidebookPage() {
  const t = useTranslations("Guidebooks");
  const isManager = useIsManager();

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

  return <NewDraftRedirect surface="wikiEntry" to={(id) => `/guidebooks/draft/${id}`} />;
}
