"use client";

import { Suspense } from "react";

import { useTranslations } from "next-intl";

import { ChatClient } from "@/components/chat/ChatClient";
import { FeatureGate } from "@/components/feature-flags/FeatureGate";

export default function ChatPage() {
  const tNav = useTranslations("Nav");

  return (
    <FeatureGate featureKey="chat" label={tNav("chat")}>
      <Suspense fallback={null}>
        <ChatClient />
      </Suspense>
    </FeatureGate>
  );
}
