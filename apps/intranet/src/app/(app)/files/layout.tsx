"use client";

import type { ReactNode } from "react";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useHasCapability } from "@/components/providers/current-user";

export default function FilesLayout({ children }: { children: ReactNode }) {
  const hasFilesAccess = useHasCapability("access_files");

  if (!hasFilesAccess) {
    return <ForbiddenScreen />;
  }

  return children;
}
