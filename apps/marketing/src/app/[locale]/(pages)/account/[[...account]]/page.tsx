import { auth } from "@clerk/nextjs/server";

import { redirect } from "@/i18n/navigation";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const [{ locale }, { userId }] = await Promise.all([params, auth()]);

  // hrefs stay locale-less: next-intl adds the prefix itself
  if (!userId) {
    redirect({
      href: { pathname: "/sign-in", query: { redirect_url: `/${locale}/account/submissions` } },
      locale,
    });
  }

  redirect({ href: "/account/submissions", locale });
}
