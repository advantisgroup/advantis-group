import { PasskeySignIn } from "@/components/passkeys/PasskeySignIn";
import { AuthShell } from "@/components/layout/AuthShell";

export default function PasskeySignInPage() {
  return (
    <AuthShell>
      <PasskeySignIn />
    </AuthShell>
  );
}
