"use client";

import { DocumentModalOpener } from "@/components/applicants/DocumentModalOpener";
import { useApplicantSubItem } from "@/components/applicants/useApplicantSubItem";

export default function ApplicantDocumentDetailPage() {
  const result = useApplicantSubItem("documents", "docId");
  if (!result) return null;

  return (
    <DocumentModalOpener
      document={{
        storageId: result.item.storageId,
        fileName: result.item.fileName,
        url: result.item.url,
      }}
    />
  );
}
