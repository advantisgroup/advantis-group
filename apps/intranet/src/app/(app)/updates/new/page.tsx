"use client";

import { NewDraftRedirect } from "@/components/compose/NewDraftRedirect";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { useIsAdmin } from "@/components/providers/current-user";

export default function NewUpdatePage() {
  const isAdmin = useIsAdmin();

  if (!isAdmin) return <ForbiddenScreen />;

  return <NewDraftRedirect surface="update" to={(id) => `/updates/draft/${id}`} />;
}
