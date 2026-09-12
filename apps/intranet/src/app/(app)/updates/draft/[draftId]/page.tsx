"use client";

import { useParams } from "next/navigation";

import { UpdateComposer } from "@/components/updates/UpdateComposer";

export default function UpdateDraftPage() {
  const { draftId } = useParams<{ draftId: string }>();
  return <UpdateComposer key={draftId} draftId={draftId} />;
}
