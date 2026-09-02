"use client";
import { type FormEvent, useCallback, useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import posthog from "posthog-js";
import { type z } from "zod";

import { api } from "@/lib/eden";
import { WhitepaperFormDataSchema } from "@/lib/schema";
import { type ButtonState, type WhitepaperFormData } from "@/types/contact";

const initialFormData: WhitepaperFormData = {
  company: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  consent: false,
};

/**
 * Step one of the double opt-in. A successful submit only means the
 * confirmation mail went out — the document itself is sent by the confirm
 * route, so the success state deliberately talks about the inbox, not a file.
 */
export function useWhitepaperRequest() {
  const t = useTranslations("whitepaper.form");
  const locale = useLocale();

  const [formData, setFormData] = useState<WhitepaperFormData>(initialFormData);
  const [errors, setErrors] = useState<z.ZodFlattenedError<WhitepaperFormData>["fieldErrors"]>({});
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
    setButtonState("idle");
    setSubmittedEmail(null);
    setFormError(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setFormError(null);

      const result = WhitepaperFormDataSchema.safeParse(formData);

      if (!result.success) {
        setErrors(result.error.flatten().fieldErrors);
        setButtonState("error");
        setTimeout(() => setButtonState("idle"), 3000);
        return;
      }

      setErrors({});
      setButtonState("loading");
      posthog.capture("Whitepaper - Requested");

      try {
        const response = await api.whitepaper.request.post({
          company: result.data.company,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          email: result.data.email,
          phone: result.data.phone,
          consent: result.data.consent,
          locale,
        });

        if (response.status !== 200) {
          setButtonState("error");
          setFormError(response.status === 503 ? t("errors.unavailable") : t("errors.generic"));
          setTimeout(() => setButtonState("idle"), 3000);
          return;
        }

        setButtonState("success");
        setSubmittedEmail(result.data.email);
      } catch {
        setButtonState("error");
        setFormError(t("errors.network"));
        setTimeout(() => setButtonState("idle"), 3000);
      }
    },
    [formData, locale, t],
  );

  return {
    formData,
    setFormData,
    errors,
    buttonState,
    formError,
    submittedEmail,
    handleSubmit,
    reset,
  };
}
