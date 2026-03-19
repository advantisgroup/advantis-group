import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { ContactSubmissionsPage } from "@/components/auth/ContactSubmissionsPage";

export default async function AccountSubmissionsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, { userId }] = await Promise.all([params, auth()]);

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  return <ContactSubmissionsPage />;
}
