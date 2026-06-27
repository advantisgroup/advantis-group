import { auth } from "@clerk/nextjs/server";

import { redirect } from "@/i18n/navigation";
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, { userId }] = await Promise.all([params, auth()]);

  if (!userId) {
    redirect({ href: `/${locale}/sign-in`, locale });
  }

  redirect({ href: `/${locale}/account/submissions`, locale });
}
