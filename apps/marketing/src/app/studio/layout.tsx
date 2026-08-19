import { redirect } from "next/navigation";

import { auth, clerkClient } from "@clerk/nextjs/server";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/de/sign-in");
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  if (user.publicMetadata.role !== "marketingAdmin") {
    redirect("/");
  }

  return <>{children}</>;
}
