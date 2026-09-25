import { currentUser, type User } from "@clerk/nextjs/server";

/** What the account area stores on the Clerk user. Only ever used to prefill and as preferences. */
export type AccountMetadata = {
  company?: string;
  phone?: string;
  role?: string;
  /** Site language, so mail sent later follows it. */
  locale?: string;
  /** false = don't mail me a copy of each inquiry. */
  inquiryCopies?: boolean;
};

export type Account = {
  user: User;
  clerkUserId: string;
  /** Every verified address, lowercased — any of them can own an inquiry. */
  emails: string[];
  primaryEmail: string;
  name: string;
  metadata: AccountMetadata;
};

/** The signed-in customer as the API routes need them, or null. */
export async function currentAccount(): Promise<Account | null> {
  const user = await currentUser();
  if (!user) return null;

  const emails = user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.toLowerCase());
  const primaryEmail = user.primaryEmailAddress?.emailAddress.toLowerCase() ?? emails[0] ?? "";

  return {
    user,
    clerkUserId: user.id,
    emails,
    primaryEmail,
    name: user.fullName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    metadata: (user.unsafeMetadata ?? {}) as AccountMetadata,
  };
}

/** The shape Convex's customer functions take. */
export const convexAccount = (account: Account) => ({
  clerkUserId: account.clerkUserId,
  emails: account.emails,
});
