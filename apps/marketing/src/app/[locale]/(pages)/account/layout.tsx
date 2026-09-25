import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AccountRail } from "@/components/account/AccountNav";
import { NO_INDEX } from "@/lib/seo";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.nav" });
  return { title: t("title"), robots: NO_INDEX };
}

/**
 * Every account page: the rail on the left from `lg` up, the page on the
 * right. Signing in is enforced in proxy.ts, so pages here can assume a
 * session.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 pt-24 pb-24 md:px-10 md:pt-32 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-16">
      <AccountRail />
      <div className="min-w-0">{children}</div>
    </main>
  );
}
