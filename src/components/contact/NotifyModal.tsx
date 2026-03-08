"use client";

import React, { useState } from "react";

import { Bell, CheckCircle2, Loader2, Mail, SmilePlusIcon } from "lucide-react";

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
import { cn } from "@/lib/utils";

interface NotifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalState = "idle" | "loading" | "success" | "duplicate" | "error";

interface NotifyResponse {
  ok?: boolean;
  duplicate?: boolean;
  error?: string;
}

export function NotifyModal({ open, onOpenChange }: NotifyModalProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ModalState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const reset = () => {
    setEmail("");
    setState("idle");
    setErrorMsg("");
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = (await res.json()) as NotifyResponse;

      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      setState(data.duplicate ? "duplicate" : "success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  const isSuccess = state === "success" || state === "duplicate";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="h-5 w-5 text-amber-400" />
            Stay in the loop
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Enter your email and we&apos;ll notify you as soon as our contact
            forms are back online.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full",
                `${state === "duplicate" ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-green-500/10 border border-green-500/30"}`
              )}
            >
              {state !== "duplicate" ? (
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              ) : (
                <SmilePlusIcon className="h-7 w-7 text-yellow-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {state === "duplicate"
                  ? "You're already on the list!"
                  : "You're on the list!"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {state === "duplicate"
                  ? "We already have your email. We'll reach out as soon as forms are live."
                  : "We'll send you a notification as soon as the contact forms go live."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="notify-email" className="text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="notify-email"
                  type="email"
                  placeholder="you@example.com"
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

            <div className="flex gap-2 justify-end pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={state === "loading"}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!email.trim() || state === "loading"}
                className="gap-1.5"
              >
                {state === "loading" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    Notify me
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
