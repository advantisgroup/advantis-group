"use client";

import { useMemo } from "react";

import { BookOpen, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { type RouteTab } from "@/components/applicants/RouteTabs";
import { useHasCapability } from "@/components/providers/current-user";

/**
 * The knowledge base's two views of the same material: the entries and the
 * OneDrive folder they attach into. Shared by both pages so the strip is
 * identical either way, and so mobile gets them in the bottom nav for free
 * (see RouteTabs).
 */
export function useKnowledgeTabs(): RouteTab[] {
  const t = useTranslations("Guidebooks");
  const canManage = useHasCapability("manage_guidebooks");

  return useMemo(
    () => [
      { value: "library", href: "/guidebooks", label: t("libraryTab"), icon: BookOpen },
      ...(canManage
        ? [
            {
              value: "files",
              href: "/guidebooks/files",
              label: t("filesTab"),
              icon: FolderOpen,
            },
          ]
        : []),
    ],
    [t, canManage],
  );
}
