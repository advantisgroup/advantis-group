/* eslint-disable no-console */
"use client";
import { useState, useCallback } from "react";

import { useUser } from "@clerk/nextjs";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { toast } from "sonner";

import { api } from "@/lib/eden";
import { type ButtonState } from "@/types/contact";

interface EmailPayload {
  firstName: string;
  lastName: string;
  message: string;
  subject: string;
  email: string;
  phone?: string;
  topic?: string;
  company?: string;
  submissionType: "message" | "callback" | "other";
  desiredDateTime?: string;
  notes?: string;
}

interface UseEmailSubmitOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  resetDelayMs?: number;
}

export function useEmailSubmit(options: UseEmailSubmitOptions = {}) {
  const { onSuccess, onError, resetDelayMs = 3000 } = options;
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const tMessages = useTranslations("contact.messages");
  const { user } = useUser();

  const showErrorToast = useCallback(
    (description: string) => {
      toast.error(tMessages("errorTitle"), {
        description,
        icon: <X />,
      });
    },
    [tMessages],
  );

  const resetButtonState = useCallback(() => {
    setTimeout(() => {
      setButtonState("idle");
    }, resetDelayMs);
  }, [resetDelayMs]);

  const sendEmail = useCallback(
    async (payload: EmailPayload, trackingEvent: string) => {
      setButtonState("loading");
      posthog.capture(trackingEvent);
      const locale = window.localStorage.getItem("NEXT_LOCALE");
      try {
        const response = await api.send.post({
          firstName: payload.firstName,
          lastName: payload.lastName,
          message: payload.message,
          phone: payload.phone,
          addresses: [process.env.NEXT_PUBLIC_EMAIL_ADRESS!],
          cc: [payload.email],
          subject: payload.subject,
          locale: locale || "de",
          topic: payload.topic,
          company: payload.company,
          submissionType: payload.submissionType,
          desiredDateTime: payload.desiredDateTime,
          notes: payload.notes,
          accountEmail: user?.primaryEmailAddress?.emailAddress || "",
          accountName: user?.fullName || "",
        });

        if (response.status === 500) {
          setButtonState("error");
          showErrorToast("Falls das Problem anhält versuchen sie es später nochmal");
          resetButtonState();
          onError?.(new Error("Server error"));
          return false;
        }

        if (response.status === 429) {
          setButtonState("error");
          toast.error("Rate Limit", {
            description: "Sie haben zu viele Anfragen geschickt. Versuchen sie es später nochmal",
            icon: <X />,
          });
          resetButtonState();
          onError?.(new Error("Rate limited"));
          return false;
        }

        setButtonState("success");
        toast.success(tMessages("successTitle"), {
          description: tMessages("successDesc"),
        });
        resetButtonState();
        onSuccess?.();
        return true;
      } catch (error) {
        console.log(error);
        setButtonState("error");
        showErrorToast("Falls das Problem anhält versuchen sie es später nochmal");
        resetButtonState();
        onError?.(error);
        return false;
      }
    },
    [onSuccess, onError, resetButtonState, showErrorToast, tMessages, user],
  );

  return {
    buttonState,
    setButtonState,
    sendEmail,
    showErrorToast,
    resetButtonState,
  };
}
