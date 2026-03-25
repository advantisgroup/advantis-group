/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { auth } from "@clerk/nextjs/server";

import { redirect } from "@/i18n/navigation";
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
