"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { WikiEntryComposer } from "@/components/guidebooks/WikiEntryComposer";
import {
  isOwnerOrAdmin,
  useCurrentUser,
  useHasCapability,
} from "@/components/providers/current-user";
import { Card, CardContent } from "@/components/ui/card";

export default function ComposeWikiEntryPage() {
  const t = useTranslations("Guidebooks");
  const { slug } = useParams<{ slug: string }>();
  const user = useCurrentUser();
  const canManageWiki = useHasCapability("manage_guidebooks");
  const entry = useQuery(api.wikiEntries.get, { slug });

  if (entry === undefined) return null;

  if (!entry || !canManageWiki || !isOwnerOrAdmin(user, entry.authorUserId)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {entry ? t("noAccess") : t("notFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Keyed by id so a different entry never inherits this one's form state.
  return <WikiEntryComposer key={entry._id} entry={entry} />;
}
