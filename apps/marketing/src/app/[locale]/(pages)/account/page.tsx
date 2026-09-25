import { AccountOverview } from "@/components/account/AccountOverview";
import { loadInquiries } from "@/lib/inquiries-server";

export default async function AccountPage() {
  return <AccountOverview data={await loadInquiries()} />;
}
