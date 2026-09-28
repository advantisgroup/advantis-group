"use client";

import { useTranslations } from "next-intl";

import { FeatureGate } from "@/components/feature-flags/FeatureGate";
import { WikiChat } from "@/components/guidebooks/wiki-chat";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useHasCapability } from "@/components/providers/current-user";

export default function WikiChatPage() {
  const t = useTranslations("Ai");
  // The flag is the feature being off for everyone; this is AI not being
  // granted to you — two different screens, deliberately.
  const canUseAi = useHasCapability("use_ai");

  return (
    <FeatureGate featureKey="ai" label={t("kind.wikiChat")}>
      {canUseAi ? (
        <div className="h-full">
          <WikiChat />
        </div>
      ) : (
        <ForbiddenScreen />
      )}
    </FeatureGate>
  );
}
