"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Matches the Convex-side StepMethod exactly (including "passkey") so the
// two packages' types line up — this form only ever renders/submits the
// other three, since a passkey is never redeemed by typing a code back in.
export type StepMethod = "email_code" | "totp" | "recovery_code" | "passkey";
export type StepUpContext = "sign_in" | "destructive" | "admin_reverify";

const RESEND_COOLDOWN_MS = 60_000;
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

async function jsonOrThrow(response: Response) {
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body;
}

export function StepUpForm({
  availableMethods,
  context,
  onVerified,
}: {
  availableMethods: StepMethod[];
  context: StepUpContext;
  onVerified: () => void;
}) {
  const t = useTranslations("StepUp");
  const { getToken } = useAuth();
  const methods = availableMethods.length > 0 ? availableMethods : (["email_code"] as StepMethod[]);
  const [method, setMethod] = useState<StepMethod>(methods[0]!);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const sentOnce = useRef<StepMethod | null>(null);

  const apiRequest = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      return await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          ...init?.headers,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [getToken],
  );

  const sendCode = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await jsonOrThrow(
        await apiRequest("/auth/step-up/request-code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ context }),
        }),
      );
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSending(false);
    }
  }, [apiRequest, context, t]);

  useEffect(() => {
    if (method !== "email_code" || sentOnce.current === "email_code") return;
    sentOnce.current = "email_code";
    void sendCode();
  }, [method, sendCode]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = (await jsonOrThrow(
        await apiRequest("/auth/step-up/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method, code, context }),
        }),
      )) as { ok: boolean; message?: string };
      if (!result.ok) {
        setError(result.message ?? t("genericError"));
        setCode("");
        return;
      }
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  return (
    <div className="space-y-3">
      {methods.length > 1 && (
        <Tabs
          value={method}
          onValueChange={(value) => {
            setMethod(value as StepMethod);
            setCode("");
            setError(null);
          }}
        >
          <TabsList>
            {methods.includes("totp") && <TabsTrigger value="totp">{t("methodTotp")}</TabsTrigger>}
            {methods.includes("email_code") && (
              <TabsTrigger value="email_code">{t("methodEmailCode")}</TabsTrigger>
            )}
            {methods.includes("recovery_code") && (
              <TabsTrigger value="recovery_code">{t("methodRecoveryCode")}</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      )}

      <div className="space-y-2">
        <Label htmlFor="step-up-code">
          {method === "totp"
            ? t("codeLabelTotp")
            : method === "recovery_code"
              ? t("codeLabelRecovery")
              : t("codeLabelEmail")}
        </Label>
        <Input
          id="step-up-code"
          autoFocus
          inputMode={method === "recovery_code" ? "text" : "numeric"}
          maxLength={method === "recovery_code" ? 20 : 6}
          placeholder={method === "recovery_code" ? "ABCDE-FGHJK" : "123456"}
          value={code}
          onChange={(e) =>
            setCode(
              method === "recovery_code"
                ? e.target.value.toUpperCase()
                : e.target.value.replace(/\D/g, "").slice(0, 6),
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length > 0 && !submitting) void submit();
          }}
          className="text-center font-mono text-lg tracking-[0.2em]"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {method === "email_code" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={sending || cooldownLeft > 0}
            onClick={() => void sendCode()}
          >
            {cooldownLeft > 0
              ? t("resendIn", { seconds: cooldownLeft })
              : sending
                ? t("sending")
                : t("resend")}
          </Button>
        )}
      </div>

      <Button
        className="w-full"
        disabled={code.length === 0 || submitting}
        onClick={() => void submit()}
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
