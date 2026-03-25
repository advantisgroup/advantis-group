import { auth } from "@clerk/nextjs/server";

import { ContactSubmissionsPage } from "@/components/auth/ContactSubmissionsPage";
import { redirect } from "@/i18n/navigation";

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
