import { cache } from "react";

import { api } from "@advantis/convex/api";
import { type FunctionReturnType } from "convex/server";

import { convexAccount, currentAccount } from "@/lib/account";
import { convex, serverKey } from "@/lib/convex-server";

export type InquiryList = FunctionReturnType<typeof api.marketing.inquiries.listForAccount>;
export type Inquiry = InquiryList["submissions"][number];
export type InquiryDetail = NonNullable<
  FunctionReturnType<typeof api.marketing.inquiries.getForAccount>
>;

/** The signed-in customer's inquiries, read on the server so the page arrives with them. */
export async function loadInquiries(limit = 50): Promise<InquiryList | null> {
  const account = await currentAccount();
  if (!account || !convex) return null;
  return await convex.query(api.marketing.inquiries.listForAccount, {
    serverKey: serverKey(),
    account: convexAccount(account),
    limit,
  });
}

// cached per request: the page and its metadata both ask for the same inquiry
export const loadInquiry = cache(async (id: string): Promise<InquiryDetail | null> => {
  const account = await currentAccount();
  if (!account || !convex) return null;
  return await convex.query(api.marketing.inquiries.getForAccount, {
    serverKey: serverKey(),
    account: convexAccount(account),
    id,
  });
});
