/* eslint-disable no-console */
"use client";
import { useState, useCallback } from "react";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useTrackEvent } from "@/lib/analytics";
import { api } from "@/lib/eden";
import { type ButtonState, type InquiryTopic } from "@/types/contact";

interface EmailPayload {
  firstName: string;
  lastName: string;
  message: string;
  subject?: string;
  email: string;
  phone?: string;
  /** the translated label, for the team mail */
  topic?: string;
  topicKey?: InquiryTopic;
  company?: string;
  submissionType: "message" | "callback" | "other";
  desiredAt?: number;
  timeZone?: string;
  notes?: string;
}

/** What the server says about an inquiry that went out. */
export interface SentInquiry {
  id: string;
  reference: string;
  copySent: boolean;
  copySkipReason?: "limit" | "preference";
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
  const locale = useLocale();
  const trackEvent = useTrackEvent();

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
    async (payload: EmailPayload, trackingEvent: string): Promise<SentInquiry | null> => {
      setButtonState("loading");
      trackEvent(trackingEvent);
      try {
        const response = await api.send.post({
          firstName: payload.firstName,
          lastName: payload.lastName,
          message: payload.message,
          phone: payload.phone,
          email: payload.email,
          subject: payload.subject,
          locale,
          topic: payload.topic,
          topicKey: payload.topicKey,
          company: payload.company,
          submissionType: payload.submissionType,
          desiredAt: payload.desiredAt,
          timeZone: payload.timeZone,
          notes: payload.notes,
        });

        if (response.error && response.status !== 429) {
          setButtonState("error");
          showErrorToast(tMessages("serverErrorDesc"));
          resetButtonState();
          onError?.(new Error("Server error"));
          return null;
        }

        if (response.status === 429) {
          setButtonState("error");
          toast.error(tMessages("rateLimitTitle"), {
            description: tMessages("rateLimitDesc"),
            icon: <X />,
          });
          resetButtonState();
          onError?.(new Error("Rate limited"));
          return null;
        }

        setButtonState("success");
        resetButtonState();
        onSuccess?.();
        return response.data;
      } catch (error) {
        console.log(error);
        setButtonState("error");
        showErrorToast(tMessages("serverErrorDesc"));
        resetButtonState();
        onError?.(error);
        return null;
      }
    },
    [locale, onSuccess, onError, resetButtonState, showErrorToast, tMessages, trackEvent],
  );

  return {
    buttonState,
    setButtonState,
    sendEmail,
    showErrorToast,
    resetButtonState,
  };
}
