import { Suspense } from "react";

import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CallbackManage } from "@/components/contact/CallbackManage";
import { NO_INDEX } from "@/lib/seo";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "callbackPage" });
  // a token link: one person's, and useless to a crawler
  return { title: t("title"), robots: NO_INDEX };
}

/** Where the "another time" and "cancel" links in a confirmed-callback mail land. */
export default function CallbackPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 pt-32 pb-24 md:pt-44">
      <Suspense>
        <CallbackManage />
      </Suspense>
    </main>
  );
}
