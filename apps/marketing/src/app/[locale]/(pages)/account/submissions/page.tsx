import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { InquiryList } from "@/components/account/InquiryList";
import { loadInquiries } from "@/lib/inquiries-server";

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.inquiries" });
  return { title: t("title") };
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const { limit: requested } = await searchParams;
  const limit = Math.min(Math.max(Number(requested) || 50, 50), 200);
  return <InquiryList data={await loadInquiries(limit)} limit={limit} />;
}
