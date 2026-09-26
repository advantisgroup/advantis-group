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
  // a plain string here would end the root "%s | ADVANTIS GROUP" template for every page below
  return {
    title: { default: t("title"), template: `%s · ${t("title")} | ADVANTIS GROUP` },
    robots: NO_INDEX,
  };
}

/**
 * Every account page: the rail on the left from `lg` up, the page on the
 * right. Signing in is enforced in proxy.ts, so pages here can assume a
 * session.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    // Manrope at small sizes renders thin and tight (Windows especially): a touch
    // more weight and tracking for the account pages' dense, mostly small text
    <main className="mx-auto w-full max-w-[1200px] px-5 pt-24 pb-24 font-[450] tracking-[0.005em] md:px-10 md:pt-32 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
      <AccountRail />
      <div className="min-w-0">{children}</div>
    </main>
  );
}
