"use client";

import { useIsAdmin } from "@/components/providers/current-user";
import { Absences } from "@/components/zeiterfassung/Absences";

export default function AbwesenheitenPage() {
  const isAdmin = useIsAdmin();
  return <Absences direct={isAdmin} />;
}
