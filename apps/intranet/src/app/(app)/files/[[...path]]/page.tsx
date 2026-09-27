"use client";

import { useParams } from "next/navigation";

import { useTranslations } from "next-intl";

import { FileBrowser } from "@/components/onedrive/FileBrowser";

export default function FilesPage() {
  const t = useTranslations("Files");
  const params = useParams<{ path?: string[] }>();
  const initialPath = (params.path ?? []).map(decodeURIComponent).join("/");
  return (
    <FileBrowser
      initialPath={initialPath}
      title={t("companyTitle")}
      description={t("companyDescription")}
    />
  );
}
