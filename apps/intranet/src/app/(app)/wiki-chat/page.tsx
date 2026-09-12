"use client";

import { useTranslations } from "next-intl";

import { FeatureGate } from "@/components/feature-flags/FeatureGate";
import { WikiChat } from "@/components/guidebooks/wiki-chat";

export default function WikiChatPage() {
  const t = useTranslations("Ai");
  return (
    <FeatureGate featureKey="ai" label={t("kind.wikiChat")}>
      <div className="h-full">
        <WikiChat className="rounded-none border-0" />
      </div>
    </FeatureGate>
  );
}
