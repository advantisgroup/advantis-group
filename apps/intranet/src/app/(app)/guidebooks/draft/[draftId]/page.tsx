"use client";

import { useParams } from "next/navigation";

import { type Id } from "@advantis/convex/dataModel";
import { useTranslations } from "next-intl";

import { WikiEntryComposer } from "@/components/guidebooks/WikiEntryComposer";
import { useIsManager } from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function NewWikiDraftPage() {
  const t = useTranslations("Guidebooks");
  const isManager = useIsManager();
  const { draftId } = useParams<{ draftId: string }>();

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

  return <WikiEntryComposer key={draftId} entry={{ draftId: draftId as Id<"drafts"> }} />;
}
