"use client";

import { Suspense } from "react";

import { Training } from "@/components/ai-training/Training";

export default function AiTrainingChatPage() {
  return (
    <Suspense>
      <Training />
    </Suspense>
  );
}
