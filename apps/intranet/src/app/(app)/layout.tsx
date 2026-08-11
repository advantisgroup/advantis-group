import type { ReactNode } from "react";

import { auth } from "@clerk/nextjs/server";

import { AppGate } from "@/components/layout/AppGate";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await auth.protect();

  return <AppGate>{children}</AppGate>;
}
