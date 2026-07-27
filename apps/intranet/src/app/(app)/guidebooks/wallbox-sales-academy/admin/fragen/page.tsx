"use client";

import { QuestionsTab } from "@/components/guidebooks/wallbox-academy/TrainerView";
import { useReadQueryParam } from "@/components/guidebooks/wallbox-academy/use-read-query-param";

export default function AdminQuestionsPage() {
  const focusQuestionId = useReadQueryParam("q");
  return <QuestionsTab focusQuestionId={focusQuestionId} />;
}
