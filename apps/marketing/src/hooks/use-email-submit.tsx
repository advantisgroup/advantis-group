/* eslint-disable no-console */
"use client";
import { useState, useCallback } from "react";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useAltcha } from "@/hooks/use-altcha";
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
  /** false = saved with its reference, but the mail to the team failed (it can be sent again) */
  delivered: boolean;
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
  const spamCheck = useAltcha();

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
    async (
      payload: EmailPayload,
      trackingEvent: string,
      /** the server refused one field (e.g. a callback time outside our hours) */
      onFieldError?: (field: string) => void,
    ): Promise<SentInquiry | null> => {
      setButtonState("loading");
      trackEvent(trackingEvent);
      try {
        const altcha = await spamCheck();
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
          altcha,
        });

        // saved, so it has a reference and shows up in the account, but it never reached the team
        if (response.error?.status === 502) {
          setButtonState("error");
          resetButtonState();
          onError?.(new Error("Not delivered"));
          const { id, reference } = response.error.value;
          return { id, reference, copySent: false, delivered: false };
        }

        if (response.error?.status === 400 && onFieldError) {
          setButtonState("error");
          showErrorToast(tMessages("errorDesc"));
          resetButtonState();
          onFieldError(response.error.value.field);
          return null;
        }

        if (response.error?.status === 403) {
          setButtonState("error");
          showErrorToast(tMessages("spamCheckDesc"));
          resetButtonState();
          onError?.(new Error("Spam check failed"));
          return null;
        }

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
        return response.data ? { ...response.data, delivered: true } : null;
      } catch (error) {
        console.log(error);
        setButtonState("error");
        showErrorToast(tMessages("serverErrorDesc"));
        resetButtonState();
        onError?.(error);
        return null;
      }
    },
    [
      locale,
      onSuccess,
      onError,
      resetButtonState,
      showErrorToast,
      spamCheck,
      tMessages,
      trackEvent,
    ],
  );

  return {
    buttonState,
    setButtonState,
    sendEmail,
    showErrorToast,
    resetButtonState,
  };
}
