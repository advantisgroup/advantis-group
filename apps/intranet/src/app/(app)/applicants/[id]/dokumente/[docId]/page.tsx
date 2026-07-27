"use client";

import { useParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";

import { DocumentModalOpener } from "@/components/applicants/DocumentModalOpener";

export default function ApplicantDocumentDetailPage() {
  const params = useParams<{ id: string; docId: string }>();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });

  if (!applicant) return null;
  const doc = applicant.documents.find((d) => d._id === params.docId);
  if (!doc) return null;

  return (
    <DocumentModalOpener
      document={{
        storageId: doc.storageId,
        fileName: doc.fileName,
        url: doc.url,
      }}
    />
  );
}
