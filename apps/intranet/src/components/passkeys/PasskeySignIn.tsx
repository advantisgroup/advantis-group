"use client";

import { useState } from "react";

import { startAuthentication } from "@simplewebauthn/browser";
import { useSignIn } from "@clerk/nextjs/legacy";
import { KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signalAcceptedPasskeys, signalUnknownPasskey } from "./passkey-signal";

type OptionsResponse = {
  options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
  flowId: string;
  rpId: string;
};

type AcceptedCredentialsSignal = {
  rpId: string;
  userId: string;
  allAcceptedCredentialIds: string[];
};

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

async function jsonOrThrow(response: Response) {
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new RequestError(body.message ?? "Request failed", response.status);
  return body;
}

export function PasskeySignIn() {
  const t = useTranslations("Settings");
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signInWithPasskey() {
    if (!signIn || !setActive) return;
    setBusy(true);
    try {
      const { options, flowId, rpId } = (await jsonOrThrow(
        await fetch(`${apiUrl}/passkeys/authentication/options`, { method: "POST" }),
      )) as OptionsResponse;
      const credential = await startAuthentication({ optionsJSON: options });
      let authentication: { ticket: string; signal?: AcceptedCredentialsSignal };
      try {
        authentication = (await jsonOrThrow(
          await fetch(`${apiUrl}/passkeys/authentication/verify`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ flowId, response: credential }),
          }),
        )) as { ticket: string; signal?: AcceptedCredentialsSignal };
      } catch (error) {
        if (error instanceof RequestError && error.status === 404) {
          try {
            await signalUnknownPasskey(rpId, credential.id);
          } catch (signalError) {
            console.warn("[passkeys] unknown credential signal failed", signalError);
          }
        }
        throw error;
      }
      const completed = await signIn.create({ strategy: "ticket", ticket: authentication.ticket });
      if (completed.status !== "complete" || !completed.createdSessionId) {
        throw new Error("Could not complete sign-in");
      }
      await setActive({ session: completed.createdSessionId });
      if (authentication.signal) {
        try {
          await signalAcceptedPasskeys(authentication.signal);
        } catch (error) {
          console.warn("[passkeys] credential sync signal failed", error);
        }
      }
      router.replace("/");
    } catch (error) {
      console.error("[passkeys] sign-in failed", error);
      toast.error(t("passkeySignInError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm border-border/70 shadow-xl shadow-black/5">
      <CardHeader>
        <div className="mb-1 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="size-5" />
        </div>
        <CardTitle>{t("signInWithPasskey")}</CardTitle>
        <CardDescription>{t("passkeySignInHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          className="w-full"
          onClick={() => void signInWithPasskey()}
          disabled={!isLoaded || busy}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {t("signInWithPasskey")}
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/sign-in">{t("useAnotherSignInMethod")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
