import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, { userId }] = await Promise.all([params, auth()]);

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  redirect(`/${locale}/account/submissions`);
}
