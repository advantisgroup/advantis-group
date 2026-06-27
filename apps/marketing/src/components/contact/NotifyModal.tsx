"use client";

import React, { useState } from "react";

import {
  Bell,
  CheckCircle2,
  Loader2,
  Mail,
  SmilePlusIcon,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

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
import { api } from "@/lib/eden";
import { cn } from "@/lib/utils";

interface NotifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalState =
  | "idle"
  | "loading"
  | "success"
  | "duplicate"
  | "removed"
  | "error";
type ModalMode = "subscribe" | "remove";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FINISHED_STATES = ["success", "duplicate", "removed"] as const;
type FinishedState = (typeof FINISHED_STATES)[number];

export function NotifyModal({ open, onOpenChange }: NotifyModalProps) {
  const t = useTranslations("contact.notify");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<ModalMode>("subscribe");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [touched, setTouched] = useState(false);

  const emailTrimmed = email.trim();
  const emailValid = EMAIL_RE.test(emailTrimmed);
  const showEmailError = touched && emailTrimmed !== "" && !emailValid;

  const reset = () => {
    setEmail("");
    setMode("subscribe");
    setState("idle");
    setErrorMsg("");
    setTouched(false);
  };

  const handleOpenChange = (value: boolean) => {
    if (state === "loading") return;
    if (!value) reset();
    onOpenChange(value);
  };

  const switchMode = (newMode: ModalMode) => {
    if (mode === newMode) return;
    setMode(newMode);
    setState("idle");
    setErrorMsg("");
    // Keep email — no need to retype when switching
  };

  const formatApiError = (errorValue: unknown) => {
    if (typeof errorValue === "string") return errorValue;

    if (errorValue && typeof errorValue === "object") {
      const payload = errorValue as {
        error?: string;
        code?: string;
        detail?: string;
      };
      const baseMessage =
        payload.detail || payload.error || t("errors.generic");
      return payload.code
        ? `${baseMessage} (code: ${payload.code})`
        : baseMessage;
    }

    return t("errors.generic");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!emailTrimmed || state === "loading" || !emailValid) return;

    setState("loading");
    setErrorMsg("");

    try {
      if (mode === "subscribe") {
        const res = await api.notify.post({
          email: emailTrimmed.toLowerCase(),
        });

        if (res.error) {
          setErrorMsg(formatApiError(res.error.value));
          setState("error");
          return;
        }

        setState(res.data?.duplicate ? "duplicate" : "success");
      } else {
        const encoded = encodeURIComponent(emailTrimmed.toLowerCase());
        const res = await api.notify({ email: encoded }).delete();

        if (res.error) {
          setErrorMsg(formatApiError(res.error.value));
          setState("error");
          return;
        }

        setState("removed");
      }
    } catch {
      setErrorMsg(t("errors.network"));
      setState("error");
    }
  };

  const isFinished = (FINISHED_STATES as readonly string[]).includes(state);

  const finishedConfig: Record<
    FinishedState,
    {
      Icon: React.ElementType;
      iconClass: string;
      containerClass: string;
      title: string;
      desc: string;
    }
  > = {
    success: {
      Icon: CheckCircle2,
      iconClass: "text-success-foreground",
      containerClass: "border-success/35 bg-success/14",
      title: t("success.title"),
      desc: t("success.description"),
    },
    duplicate: {
      Icon: SmilePlusIcon,
      iconClass: "text-warning-foreground",
      containerClass: "border-warning/35 bg-warning/12",
      title: t("duplicate.title"),
      desc: t("duplicate.description"),
    },
    removed: {
      Icon: XCircle,
      iconClass: "text-destructive",
      containerClass: "border-destructive/30 bg-destructive/10",
      title: t("removed.title"),
      desc: t("removed.description"),
    },
  };

  const finished = isFinished ? finishedConfig[state as FinishedState] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span
              key={mode}
              className="animate-in fade-in slide-in-from-left-1 duration-200 flex items-center gap-2"
            >
              {mode === "subscribe" ? (
                <Bell className="h-5 w-5 text-amber-400" />
              ) : (
                <Trash2 className="h-5 w-5 text-destructive" />
              )}
              {mode === "subscribe" ? t("subscribe.title") : t("remove.title")}
            </span>
          </DialogTitle>
          <DialogDescription
            key={mode}
            className="animate-in fade-in duration-200 text-muted-foreground"
          >
            {mode === "subscribe"
              ? t("subscribe.description")
              : t("remove.description")}
          </DialogDescription>
        </DialogHeader>

        {finished ? (
          <div
            key={state}
            className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center gap-4 py-6 text-center"
          >
            <div
              className={cn(
                "animate-in zoom-in-75 duration-500 delay-100 flex h-14 w-14 items-center justify-center rounded-full border",
                finished.containerClass
              )}
            >
              <finished.Icon className={cn("h-7 w-7", finished.iconClass)} />
            </div>
            <div>
              <p className="font-semibold text-foreground">{finished.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {finished.desc}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => handleOpenChange(false)}
            >
              {t("close")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Mode segmented toggle */}
            <div className="flex rounded-lg border border-border/50 bg-muted/30 p-0.5 text-xs">
              <button
                type="button"
                disabled={state === "loading"}
                onClick={() => switchMode("subscribe")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all duration-150",
                  mode === "subscribe"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Bell className="h-3 w-3" />
                {t("tabs.subscribe")}
              </button>
              <button
                type="button"
                disabled={state === "loading"}
                onClick={() => switchMode("remove")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all duration-150",
                  mode === "remove"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Trash2 className="h-3 w-3" />
                {t("tabs.remove")}
              </button>
            </div>

            {/* Email input */}
            <div className="space-y-1.5">
              <Label htmlFor="notify-email" className="text-sm font-medium">
                {t("emailLabel")}
              </Label>
              <div className="relative">
                <Mail
                  className={cn(
                    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-150",
                    showEmailError
                      ? "text-destructive/70"
                      : "text-muted-foreground"
                  )}
                />
                <Input
                  id="notify-email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    // Clear API error as soon as user starts correcting
                    if (state === "error") {
                      setState("idle");
                      setErrorMsg("");
                    }
                  }}
                  onBlur={() => setTouched(true)}
                  required
                  disabled={state === "loading"}
                  className={cn(
                    "pl-9 transition-all duration-150",
                    showEmailError &&
                      "border-destructive/60 focus-visible:ring-destructive/25"
                  )}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {showEmailError && (
                <p className="animate-in fade-in slide-in-from-top-1 duration-150 text-xs text-destructive">
                  {t("errors.invalidEmail")}
                </p>
              )}
              {state === "error" && !showEmailError && (
                <p className="animate-in fade-in slide-in-from-top-1 duration-150 text-xs text-destructive">
                  {errorMsg}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={state === "loading"}
                onClick={() => handleOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!emailTrimmed || state === "loading"}
                className={cn(
                  "gap-1.5 transition-colors duration-150",
                  mode === "remove" &&
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                )}
              >
                {state === "loading" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {mode === "subscribe"
                      ? t("subscribe.loading")
                      : t("remove.loading")}
                  </>
                ) : mode === "subscribe" ? (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    {t("subscribe.cta")}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("remove.cta")}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
