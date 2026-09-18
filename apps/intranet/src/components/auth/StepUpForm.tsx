"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { startAuthentication } from "@simplewebauthn/browser";
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
export type StepUpContext = "sign_in" | "destructive" | "admin_reverify" | "area_reverify";
export type Area = "performance" | "applicant_vault";

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

/** Lowest number wins the default slot. A passkey leads where the account has
 * one: it's the strongest factor here and the only one that needs nothing
 * typed. A recovery code is a one-shot, burn-it-and-print-a-new-one
 * credential — offering it first (which the raw server order did) invites
 * people to spend one when their authenticator was sitting in their pocket. */
const METHOD_PRIORITY: Record<StepMethod, number> = {
  passkey: 0,
  totp: 1,
  email_code: 2,
  recovery_code: 3,
};

/**
 * Cleans up a pasted string before the slots try to consume it.
 *
 * Whatever the user pastes arrives verbatim, and any character the input
 * rejects makes the whole paste fail silently — no error, nothing appears.
 * Real pastes are messy: mail clients render the code as "123 456", people
 * double-tap and grab a trailing space, and selecting the sentence in the
 * email body yields something like "Your code is 200530".
 */
function transformPastedCode(pasted: string): string {
  // First run of 6+ digits wins. Codes are always at least six, so a run that
  // long is the code and nothing else — no need to reason about the words
  // around it, which modern "copy code" buttons and clipboard suggestions
  // don't hand over anyway.
  const run = pasted.match(/\d{6,}/);
  if (run) return run[0].slice(0, 6);

  // Nothing that long: the code was split by a separator ("200 530",
  // "200-530"), so drop everything that isn't a digit and let the slots take
  // what fits.
  return pasted.replace(/\D/g, "");
}

/** Masks the local part but keeps enough to recognise which account this is:
 * `kaleb.daniel@gmail.com` → `ka•••••@gmail.com`. Showing the address in full
 * on a shared or over-the-shoulder screen leaks more than it helps; a blind
 * "we sent you a code" helps less than it should. */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(3, Math.min(local.length - head.length, 5)))}@${domain}`;
}

async function jsonOrThrow(response: Response) {
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body;
}

export function StepUpForm({
  availableMethods,
  context,
  area,
  email,
  onVerified,
}: {
  availableMethods: StepMethod[];
  context: StepUpContext;
  /** Only with `context === "area_reverify"`. */
  area?: Area;
  /** Only shown (masked) on the email path — the other methods never mention
   * an address, so passing it is harmless when it goes unused. */
  email?: string;
  onVerified: () => void;
}) {
  const t = useTranslations("StepUp");
  const { getToken } = useAuth();
  const methods = (
    availableMethods.length > 0 ? availableMethods : (["email_code"] as StepMethod[])
  )
    // Signing in is the one place a passkey isn't a step-up: there the passkey
    // route is signing in again, handled by the screen around this form.
    .filter((candidate) => candidate !== "passkey" || context !== "sign_in")
    .sort((a, b) => METHOD_PRIORITY[a] - METHOD_PRIORITY[b]);
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

  /** Re-verifies with a passkey: the same WebAuthn challenge the sign-in
   * screen uses, redeemed against the step-up endpoint so it records a
   * verification for this session instead of starting a new one. */
  const submitPasskey = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { options, flowId } = (await jsonOrThrow(
        await fetch(`${apiUrl}/passkeys/authentication/options`, {
          method: "POST",
        }),
      )) as {
        options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
        flowId: string;
      };
      const credential = await startAuthentication({ optionsJSON: options });
      const result = (await jsonOrThrow(
        await apiRequest("/auth/step-up/verify-passkey", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId, response: credential, context, area }),
        }),
      )) as { ok: boolean; message?: string };
      if (!result.ok) {
        setError(result.message ?? t("genericError"));
        return;
      }
      onVerified();
    } catch (err) {
      // A cancelled prompt throws too — it isn't an error worth shouting
      // about, so it reads as "that didn't go through, try again".
      setError(err instanceof Error && err.name === "NotAllowedError" ? null : t("passkeyError"));
    } finally {
      setSubmitting(false);
    }
  }, [apiRequest, area, context, onVerified, t]);

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
            body: JSON.stringify({ method, code: value, context, area }),
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
    [apiRequest, area, context, method, onVerified, t],
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
      {/*
       * Lives here rather than on the screen because it has to track `method`
       * — the screen used to render "we sent a code to <address>" statically,
       * so switching to the authenticator app left it claiming an email was
       * sent that never was.
       */}
      <div className="space-y-1 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {method === "email_code"
            ? t("promptEmail")
            : method === "totp"
              ? t("promptTotp")
              : method === "passkey"
                ? t("promptPasskey")
                : t("promptRecovery")}
        </p>
        {method === "email_code" && email ? (
          // Its own line, not inlined into the sentence: an address inside a
          // centred paragraph wraps mid-token ("…@gmail.co / m"). Alone on a
          // line it only breaks when it genuinely cannot fit, and
          // `overflow-wrap: anywhere` prefers a real break opportunity first.
          <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
            {maskEmail(email)}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {method === "passkey" ? (
          <Button className="w-full" disabled={busy} onClick={() => void submitPasskey()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {busy ? t("submitting") : t("usePasskey")}
          </Button>
        ) : isOtpMethod(method) ? (
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
              pasteTransformer={transformPastedCode}
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
                // Trimmed because a pasted recovery code usually drags
                // whitespace along with it, and there's never a legitimate
                // space to type inside one.
                setCode(e.target.value.trim().toUpperCase());
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
      {!isOtpMethod(method) && method !== "passkey" && (
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
                                : candidate === "passkey"
                                  ? t("methodPasskey")
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
