"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Loader2, Mail, LifeBuoy, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

// Matches the Convex-side StepMethod exactly (including "passkey") so the
// two packages' types line up — this form only ever renders/submits the
// other three, since a passkey is never redeemed by typing a code back in.
export type StepMethod = "email_code" | "totp" | "recovery_code" | "passkey";
export type StepUpContext = "sign_in" | "destructive" | "admin_reverify";

const RESEND_COOLDOWN_MS = 60_000;
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:3002";

const METHOD_ICON = {
  totp: Smartphone,
  email_code: Mail,
  recovery_code: LifeBuoy,
  passkey: KeyRound,
} as const;

/** Recovery codes are alphanumeric and longer, so they keep a plain text
 * field — six fixed slots is the wrong shape for them. */
const isOtpMethod = (method: StepMethod) => method === "totp" || method === "email_code";

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
  const methods = (
    availableMethods.length > 0 ? availableMethods : (["email_code"] as StepMethod[])
  ).filter((candidate) => candidate !== "passkey");
  const [method, setMethod] = useState<StepMethod>(methods[0] ?? "email_code");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [showMethods, setShowMethods] = useState(false);
  const sentOnce = useRef<StepMethod | null>(null);
  // Guards the auto-submit so a re-render at six characters can't fire the
  // same code twice while the first request is still in flight.
  const submittedCode = useRef<string | null>(null);

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

  const submit = useCallback(
    async (value: string) => {
      if (submittedCode.current === value) return;
      submittedCode.current = value;
      setSubmitting(true);
      setError(null);
      try {
        const result = (await jsonOrThrow(
          await apiRequest("/auth/step-up/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ method, code: value, context }),
          }),
        )) as { ok: boolean; message?: string };
        if (!result.ok) {
          setError(result.message ?? t("genericError"));
          setCode("");
          submittedCode.current = null;
          return;
        }
        onVerified();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("genericError"));
        setCode("");
        submittedCode.current = null;
      } finally {
        setSubmitting(false);
      }
    },
    [apiRequest, context, method, onVerified, t],
  );

  // Auto-submit the moment six digits land — whether typed, pasted, or filled
  // by the OS one-time-code suggestion. Pressing a button after the code is
  // already complete is pure friction; the button stays for the recovery-code
  // path and as a visible affordance while the code is short.
  function handleOtpChange(value: string) {
    setCode(value);
    setError(null);
    if (value.length === 6) void submit(value);
  }

  function switchMethod(next: StepMethod) {
    setMethod(next);
    setCode("");
    setError(null);
    submittedCode.current = null;
    setShowMethods(false);
  }

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const otherMethods = methods.filter((candidate) => candidate !== method);
  const busy = submitting;

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {isOtpMethod(method) ? (
          <motion.div
            // Re-keyed per method so switching re-plays the entrance rather
            // than silently swapping the slots' contents underneath you.
            key={method}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            className={cn(error && "animate-shake")}
          >
            <InputOTP
              maxLength={6}
              value={code}
              onChange={handleOtpChange}
              disabled={busy}
              autoFocus
              containerClassName="w-full justify-center"
              aria-label={method === "totp" ? t("codeLabelTotp") : t("codeLabelEmail")}
            >
              <InputOTPGroup className="flex-1">
                <InputOTPSlot index={0} aria-invalid={!!error} />
                <InputOTPSlot index={1} aria-invalid={!!error} />
                <InputOTPSlot index={2} aria-invalid={!!error} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup className="flex-1">
                <InputOTPSlot index={3} aria-invalid={!!error} />
                <InputOTPSlot index={4} aria-invalid={!!error} />
                <InputOTPSlot index={5} aria-invalid={!!error} />
              </InputOTPGroup>
            </InputOTP>
          </motion.div>
        ) : (
          <div className={cn("space-y-2", error && "animate-shake")}>
            <Input
              id="step-up-code"
              autoFocus
              inputMode="text"
              autoComplete="one-time-code"
              maxLength={20}
              placeholder="ABCDE-FGHJK"
              aria-label={t("codeLabelRecovery")}
              aria-invalid={!!error}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length > 0 && !busy) void submit(code);
              }}
              className="h-12 text-center font-mono text-base tracking-[0.18em]"
            />
          </div>
        )}

        {/* Reserved line: without it the whole column jumps up and down as
            errors appear and clear, which on mobile shifts the slots out from
            under the thumb mid-typing. */}
        <div className="min-h-5 text-center">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key={error}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                role="alert"
                className="text-sm text-destructive text-balance"
              >
                {error}
              </motion.p>
            ) : submitting ? (
              <motion.p
                key="verifying"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground"
              >
                <Loader2 className="size-3.5 animate-spin" />
                {t("submitting")}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* The recovery-code path has no natural completion length, so it keeps
          an explicit button. OTP methods auto-submit at six digits. */}
      {!isOtpMethod(method) && (
        <Button
          className="w-full"
          disabled={code.length === 0 || busy}
          onClick={() => void submit(code)}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? t("submitting") : t("submit")}
        </Button>
      )}

      <div className="space-y-2 text-center">
        {method === "email_code" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto py-1.5 text-sm font-normal text-muted-foreground hover:text-foreground"
            disabled={sending || cooldownLeft > 0 || busy}
            onClick={() => void sendCode()}
          >
            {cooldownLeft > 0
              ? t("resendIn", { seconds: cooldownLeft })
              : sending
                ? t("sending")
                : t("resend")}
          </Button>
        )}

        {otherMethods.length > 0 && (
          <div>
            {/* A tab bar with three labels ("Authenticator app", "Email code",
                "Recovery code") wraps or clips below ~380px. A disclosure that
                only opens when you actually can't use the default method fits
                any width and keeps the primary path uncluttered. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showMethods}
              className="h-auto py-1.5 text-sm font-normal text-muted-foreground hover:text-foreground"
              onClick={() => setShowMethods((open) => !open)}
            >
              {t("tryAnotherWay")}
            </Button>

            <AnimatePresence initial={false}>
              {showMethods && (
                <motion.div
                  key="methods"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 grid gap-2">
                    {otherMethods.map((candidate) => {
                      const Icon = METHOD_ICON[candidate];
                      return (
                        <button
                          key={candidate}
                          type="button"
                          onClick={() => switchMethod(candidate)}
                          className="flex min-h-11 items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3.5 text-left transition-colors hover:border-border hover:bg-card"
                        >
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 text-sm">
                            {candidate === "totp"
                              ? t("methodTotp")
                              : candidate === "email_code"
                                ? t("methodEmailCode")
                                : t("methodRecoveryCode")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
