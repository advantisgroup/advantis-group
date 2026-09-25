import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { InquiryDetail } from "@/components/account/InquiryDetail";
import { loadInquiry } from "@/lib/inquiries-server";

type Props = { params: Promise<{ locale: string; id: string }> };

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await loadInquiry(id);
  return { title: detail?.inquiry.reference };
}

export default async function InquiryPage({ params }: Props) {
  const { id } = await params;
  const detail = await loadInquiry(id);
  if (!detail) notFound();
  return <InquiryDetail detail={detail} />;
}
