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

type ModalState = "idle" | "loading" | "success" | "duplicate" | "removed" | "error";
type ModalMode = "subscribe" | "remove";

export function NotifyModal({ open, onOpenChange }: NotifyModalProps) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;

    setState("loading");
    setErrorMsg("");

    try {
      if (mode === "subscribe") {
        const res = await api.notify.post({
          email: encodeURIComponent(email.trim().toLowerCase())
        })

        const data = res.data

        if (res.error) {
          const errValue = res.error.value;
          const msg = typeof errValue === "string" ? errValue : ("error" in errValue ? errValue.error : "Something went wrong. Please try again.");
          setErrorMsg(msg);
          setState("error");
          return;
        }

        setState(data?.duplicate ? "duplicate" : "success");
      } else {
        const encoded = encodeURIComponent(email.trim().toLowerCase());
        const res = await api.notify({ email: encoded }).delete();

        if (res.error) {
          const errValue = res.error.value;
          const msg = typeof errValue === "string" ? errValue : ("error" in errValue ? errValue.error : "Something went wrong. Please try again.");
          setErrorMsg(msg);
          setState("error");
          return;
        }

        setState("removed");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setState("error");
    }
  };

  const isFinished = state === "success" || state === "duplicate" || state === "removed";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {mode === "subscribe" ? (
              <>
                <Bell className="h-5 w-5 text-amber-400" />
                Stay in the loop
              </>
            ) : (
              <>
                <Trash2 className="h-5 w-5 text-red-400" />
                Remove your email
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === "subscribe"
              ? "Enter your email and we'll notify you as soon as our contact forms are back online."
              : "Enter the email address you'd like to remove from our notification list."}
          </DialogDescription>
        </DialogHeader>

        {isFinished ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full",
                state === "duplicate"
                  ? "bg-yellow-500/10 border border-yellow-500/30"
                  : state === "removed"
                    ? "bg-red-500/10 border border-red-500/30"
                    : "bg-green-500/10 border border-green-500/30"
              )}
            >
              {state === "duplicate" ? (
                <SmilePlusIcon className="h-7 w-7 text-yellow-400" />
              ) : state === "removed" ? (
                <XCircle className="h-7 w-7 text-red-400" />
              ) : (
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              )}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {state === "duplicate"
                  ? "You're already on the list!"
                  : state === "removed"
                    ? "Email removed"
                    : "You're on the list!"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {state === "duplicate"
                  ? "We already have your email. We'll reach out as soon as forms are live."
                  : state === "removed"
                    ? "Your email has been removed from our notification list. You won't receive any further updates."
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

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={state === "loading"}
                onClick={() => switchMode(mode === "subscribe" ? "remove" : "subscribe")}
                className="mr-auto px-0 text-xs text-muted-foreground"
              >
                {mode === "subscribe"
                  ? "Remove email from list"
                  : "← Back to notifications"}
              </Button>
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
                className={cn("gap-1.5", mode === "remove" && "bg-red-600 hover:bg-red-700 text-white")}
              >
                {state === "loading" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {mode === "subscribe" ? "Saving…" : "Removing…"}
                  </>
                ) : mode === "subscribe" ? (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    Notify me
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
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

