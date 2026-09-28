"use client";

import React, { useEffect, useRef, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAltcha } from "@/hooks/use-altcha";
import { api } from "@/lib/eden";
import { cn } from "@/lib/utils";

interface NotifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Action = "subscribe" | "unsubscribe";
type Step = "email" | "code" | "done";
type Outcome = "subscribed" | "duplicate" | "unsubscribed";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_AFTER_S = 60;

const OUTCOME_COPY = {
  subscribed: "success",
  duplicate: "duplicate",
  unsubscribed: "removed",
} as const;

/**
 * Joining or leaving the "tell me when forms are back" list.
 *
 * Anyone could type anyone's address here, so the address has to prove it's
 * theirs — but that proof should cost the person as little as possible:
 * signed in with that address already counts, and otherwise it's one code
 * from their inbox, typed into this same dialog. No account, no link to click.
 */
export function NotifyModal({ open, onOpenChange }: NotifyModalProps) {
  const t = useTranslations("contact.notify");
  const spamCheck = useAltcha();
  const locale = useLocale();
  const { user } = useUser();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const [action, setAction] = useState<Action>("subscribe");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("subscribed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const emailTrimmed = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(emailTrimmed);
  const isOwnAddress = accountEmail !== "" && emailTrimmed === accountEmail.toLowerCase();

  // prefill with the account's address the first time the dialog opens
  useEffect(() => {
    if (open && accountEmail) setEmail((current) => current || accountEmail);
  }, [open, accountEmail]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const reset = () => {
    setAction("subscribe");
    setStep("email");
    setEmail("");
    setCode("");
    setBusy(false);
    setError("");
    setNotice("");
    setResendIn(0);
  };

  const handleOpenChange = (value: boolean) => {
    if (busy) return;
    if (!value) reset();
    onOpenChange(value);
  };

  const errorFor = (status: number) => {
    if (status === 429) return t("errors.rateLimited");
    return t("errors.generic");
  };

  /** Asks for the change; the server either does it right away or mails a code. */
  const request = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res =
        action === "subscribe"
          ? await api.notify.post({ email: emailTrimmed, locale, altcha: await spamCheck() })
          : await api
              .notify({ email: encodeURIComponent(emailTrimmed) })
              .delete(undefined, { query: { locale } });

      if (res.error || !res.data) {
        setError(errorFor(res.status));
        return false;
      }

      if (res.data.status === "codeSent") {
        setStep("code");
        setResendIn(RESEND_AFTER_S);
      } else {
        setOutcome(res.data.status);
        setStep("done");
      }
      return true;
    } catch {
      setError(t("errors.network"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await api.notify.verify.post({ email: emailTrimmed, code: value, action });

      if (res.error || !res.data) {
        const codeError =
          res.status === 410
            ? t("errors.codeExpired")
            : res.status === 429
              ? t("errors.codeLocked")
              : res.status === 400
                ? t("errors.codeInvalid")
                : t("errors.generic");
        setError(codeError);
        setCode("");
        codeRef.current?.focus();
        return;
      }

      if (res.data.status !== "codeSent") setOutcome(res.data.status);
      setStep("done");
    } catch {
      setError(t("errors.network"));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setCode("");
    if (await request()) setNotice(t("code.resent"));
  };

  const switchAction = () => {
    setAction((current) => (current === "subscribe" ? "unsubscribe" : "subscribe"));
    setError("");
  };

  const title =
    step === "code"
      ? t("code.title")
      : action === "subscribe"
        ? t("subscribe.title")
        : t("remove.title");

  const description =
    step === "code"
      ? t("code.description", { email: emailTrimmed })
      : action === "subscribe"
        ? t("subscribe.description")
        : t("remove.description");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "done" ? (
          <div role="status" className="py-2">
            <CheckCircle2 aria-hidden className="size-6 text-success" />
            <DialogTitle className="mt-4 text-xl font-medium">
              {t(`${OUTCOME_COPY[outcome]}.title`)}
            </DialogTitle>
            <DialogDescription className="mt-2 text-[15px] leading-relaxed">
              {t(`${OUTCOME_COPY[outcome]}.description`)}
            </DialogDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-6"
              onClick={() => handleOpenChange(false)}
            >
              {t("close")}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-medium">{title}</DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed">
                {description}
              </DialogDescription>
            </DialogHeader>

            {step === "email" ? (
              <form
                noValidate
                className="space-y-4 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (emailValid && !busy) void request();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="notify-email">{t("emailLabel")}</Label>
                  <Input
                    id="notify-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder={t("emailPlaceholder")}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    disabled={busy}
                    aria-invalid={Boolean(error)}
                  />
                  {error ? (
                    <p className="text-[13px] text-destructive">{error}</p>
                  ) : isOwnAddress ? (
                    <p className="text-[13px] text-muted-foreground">{t("signedInHint")}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={switchAction}
                    disabled={busy}
                    className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {action === "subscribe" ? t("unsubscribeLink") : t("subscribeLink")}
                  </button>
                  <Button type="submit" size="sm" disabled={!emailValid || busy}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {action === "subscribe" ? t("subscribe.cta") : t("remove.cta")}
                  </Button>
                </div>
              </form>
            ) : (
              <form
                noValidate
                className="space-y-4 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.length === 6 && !busy) void verify(code);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="notify-code">{t("code.label")}</Label>
                  <Input
                    ref={codeRef}
                    id="notify-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setCode(digits);
                      setError("");
                      // pasting or autofilling the whole code confirms it straight away
                      if (digits.length === 6 && !busy) void verify(digits);
                    }}
                    disabled={busy}
                    aria-invalid={Boolean(error)}
                    className={cn(
                      "h-12 text-center font-mono text-xl tracking-[0.5em] md:text-xl",
                      error && "border-destructive",
                    )}
                  />
                  {error ? (
                    <p className="text-[13px] text-destructive">{error}</p>
                  ) : notice ? (
                    <p className="text-[13px] text-muted-foreground">{notice}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-col items-start gap-1 text-[13px]">
                    <button
                      type="button"
                      onClick={() => void resend()}
                      disabled={busy || resendIn > 0}
                      className="text-muted-foreground underline-offset-2 enabled:hover:text-foreground enabled:hover:underline disabled:opacity-60"
                    >
                      {resendIn > 0 ? t("code.resendIn", { seconds: resendIn }) : t("code.resend")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setCode("");
                        setError("");
                        setNotice("");
                      }}
                      disabled={busy}
                      className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {t("code.changeEmail")}
                    </button>
                  </div>
                  <Button type="submit" size="sm" disabled={code.length !== 6 || busy}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {busy ? t("code.loading") : t("code.cta")}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
