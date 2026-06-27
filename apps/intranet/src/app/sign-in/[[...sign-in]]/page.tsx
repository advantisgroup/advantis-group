import { SignIn } from "@clerk/nextjs";

import { AuthShell } from "@/components/layout/AuthShell";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full flex justify-center",
            cardBox:
              "shadow-xl shadow-black/5 border border-border/70 rounded-2xl",
          },
        }}
      />
    </AuthShell>
  );
}
