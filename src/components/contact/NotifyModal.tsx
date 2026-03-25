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

export function NotifyModal({ open, onOpenChange }: NotifyModalProps) {
  const t = useTranslations("contact.notify");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<ModalMode>("subscribe");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const reset = () => {
    setEmail("");
    setMode("subscribe");
    setState("idle");
    setErrorMsg("");
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const switchMode = (newMode: ModalMode) => {
    setMode(newMode);
    setState("idle");
    setErrorMsg("");
  };

  const formatApiError = (errorValue: unknown) => {
    if (typeof errorValue === "string") {
      return errorValue;
    }

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
    if (!email.trim() || state === "loading") return;

    setState("loading");
    setErrorMsg("");

    try {
      if (mode === "subscribe") {
        const res = await api.notify.post({
          email: email.trim().toLowerCase(),
        });

        const data = res.data;

        if (res.error) {
          setErrorMsg(formatApiError(res.error.value));
          setState("error");
          return;
        }

        setState(data?.duplicate ? "duplicate" : "success");
      } else {
        const encoded = encodeURIComponent(email.trim().toLowerCase());
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

  const isFinished =
    state === "success" || state === "duplicate" || state === "removed";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {mode === "subscribe" ? (
              <>
                <Bell className="h-5 w-5 text-amber-400" />
                {t("subscribe.title")}
              </>
            ) : (
              <>
                <Trash2 className="h-5 w-5 text-destructive" />
                {t("remove.title")}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === "subscribe"
              ? t("subscribe.description")
              : t("remove.description")}
          </DialogDescription>
        </DialogHeader>

        {isFinished ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full",
                state === "duplicate"
                  ? "border border-warning/35 bg-warning/12"
                  : state === "removed"
                    ? "border border-destructive/30 bg-destructive/10"
                    : "border border-success/35 bg-success/14"
              )}
            >
              {state === "duplicate" ? (
                <SmilePlusIcon className="h-7 w-7 text-warning-foreground" />
              ) : state === "removed" ? (
                <XCircle className="h-7 w-7 text-destructive" />
              ) : (
                <CheckCircle2 className="h-7 w-7 text-success-foreground" />
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {state === "duplicate"
                  ? t("duplicate.title")
                  : state === "removed"
                    ? t("removed.title")
                    : t("success.title")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {state === "duplicate"
                  ? t("duplicate.description")
                  : state === "removed"
                    ? t("removed.description")
                    : t("success.description")}
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
            <div className="space-y-1.5">
              <Label htmlFor="notify-email" className="text-sm font-medium">
                {t("emailLabel")}
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="notify-email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={state === "loading"}
                  className="pl-9"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              {state === "error" && (
                <p className="text-xs text-destructive mt-1">{errorMsg}</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={state === "loading"}
                onClick={() =>
                  switchMode(mode === "subscribe" ? "remove" : "subscribe")
                }
                className="mr-auto px-0 text-xs text-muted-foreground"
              >
                {mode === "subscribe"
                  ? t("switchToRemove")
                  : t("switchToSubscribe")}
              </Button>
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
                disabled={!email.trim() || state === "loading"}
                className={cn(
                  "gap-1.5",
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
