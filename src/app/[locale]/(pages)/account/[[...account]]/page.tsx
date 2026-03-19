import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { ClerkAccountPage } from "@/components/auth/ClerkAccountPage";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, { userId }] = await Promise.all([params, auth()]);

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  return <ClerkAccountPage />;
}
