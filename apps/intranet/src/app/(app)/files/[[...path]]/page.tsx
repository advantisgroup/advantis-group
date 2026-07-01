"use client";

import { useParams } from "next/navigation";

import { FileBrowser } from "@/components/onedrive/FileBrowser";

export default function FilesPage() {
  const params = useParams<{ path?: string[] }>();
  const initialPath = (params.path ?? []).map(decodeURIComponent).join("/");
  return <FileBrowser initialPath={initialPath} />;
}
