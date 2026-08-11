"use client";
import { type FormEvent, useState, useCallback, useMemo } from "react";

import { useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { type z } from "zod";

import { FormDataSchema, OtherFormDataSchema, CallbackFormDataSchema } from "@/lib/schema";
import {
  type AccountContactProfile,
  type FormData,
  type OtherFormData,
  type CallbackFormData,
  type ContactMode,
} from "@/types/contact";

import { useEmailSubmit } from "./use-email-submit";

const initialFormData: FormData = {
  company: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  message: "",
  mode: "",
};

const initialOtherFormData: OtherFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  topic: "question",
  subject: "",
  message: "",
  mode: "",
};

const initialCallbackFormData: CallbackFormData = {
  company: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  dateTime: "",
  notes: "",
};

export function useContactForm() {
  const tMessages = useTranslations("contact.messages");
  const tOtherForm = useTranslations("contact.otherForm");
  const { user, isSignedIn } = useUser();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [otherFormData, setOtherFormData] = useState<OtherFormData>(initialOtherFormData);
  const [callbackFormData, setCallbackFormData] =
    useState<CallbackFormData>(initialCallbackFormData);

  const [errors, setErrors] = useState<z.ZodFlattenedError<FormData>["fieldErrors"]>({});
  const [otherErrors, setOtherErrors] = useState<z.ZodFlattenedError<OtherFormData>["fieldErrors"]>(
    {},
  );
  const [callbackErrors, setCallbackErrors] = useState<
    z.ZodFlattenedError<CallbackFormData>["fieldErrors"]
  >({});
  const [accountPrefillState, setAccountPrefillState] = useState<"idle" | "success">("idle");

  const messageSubmit = useEmailSubmit();
  const callbackSubmit = useEmailSubmit();
  const otherSubmit = useEmailSubmit();

  const accountProfile = useMemo<AccountContactProfile | null>(() => {
    if (!isSignedIn || !user) {
      return null;
    }

    return {
      email: user.primaryEmailAddress?.emailAddress || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" "),
    };
  }, [isSignedIn, user]);

  const applyAccountProfile = useCallback(() => {
    if (!accountProfile) {
      return false;
    }

    setFormData((current) => ({
      ...current,
      firstName: accountProfile.firstName || current.firstName,
      lastName: accountProfile.lastName || current.lastName,
      email: accountProfile.email || current.email,
    }));

    setOtherFormData((current) => ({
      ...current,
      firstName: accountProfile.firstName || current.firstName,
      lastName: accountProfile.lastName || current.lastName,
      email: accountProfile.email || current.email,
    }));

    setCallbackFormData((current) => ({
      ...current,
      firstName: accountProfile.firstName || current.firstName,
      lastName: accountProfile.lastName || current.lastName,
      email: accountProfile.email || current.email,
    }));

    setAccountPrefillState("success");
    window.setTimeout(() => setAccountPrefillState("idle"), 2500);

    return true;
  }, [accountProfile]);

  const getButtonState = useCallback(
    (mode: ContactMode) => {
      switch (mode) {
        case "message":
          return messageSubmit.buttonState;
        case "callback":
          return callbackSubmit.buttonState;
        case "other":
          return otherSubmit.buttonState;
        default:
          return "idle";
      }
    },
    [messageSubmit.buttonState, callbackSubmit.buttonState, otherSubmit.buttonState],
  );

  const validateAndShowError = useCallback(
    <T>(
      schema: z.ZodType<T>,
      data: unknown,
      setErrorsFn: (errors: Partial<Record<string, string[]>>) => void,
      setButtonError: () => void,
    ): data is T => {
      const result = schema.safeParse(data);

      if (!result.success) {
        const { fieldErrors } = result.error.flatten();
        setErrorsFn(fieldErrors);
        setButtonError();

        return false;
      }

      setErrorsFn({});
      return true;
    },
    [],
  );

  const handleMessageSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      const dataToValidate = { ...formData, mode: "message" };

      if (
        !validateAndShowError(FormDataSchema, dataToValidate, setErrors, () => {
          messageSubmit.setButtonState("error");
          messageSubmit.showErrorToast(tMessages("errorDesc"));
          messageSubmit.resetButtonState();
        })
      ) {
        return;
      }

      await messageSubmit.sendEmail(
        {
          firstName: formData.firstName,
          lastName: formData.lastName,
          message: formData.message,
          email: formData.email,
          phone: formData.phone,
          company: formData.company,
          submissionType: "message",
          subject: `User Request - Message`,
        },
        "User - Message Submitted",
      );
    },
    [formData, messageSubmit, validateAndShowError, tMessages],
  );

  const handleCallbackSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (
        !validateAndShowError(CallbackFormDataSchema, callbackFormData, setCallbackErrors, () => {
          callbackSubmit.setButtonState("error");
          callbackSubmit.showErrorToast(tMessages("errorDesc"));
          callbackSubmit.resetButtonState();
        })
      ) {
        return;
      }

      const message = `Rückruf Anfrage\n\nFirma: ${callbackFormData.company}\nGewünschte Zeit: ${callbackFormData.dateTime}\nTelefon: ${callbackFormData.phone}\n\nNotizen:\n${callbackFormData.notes || "Keine"}`;

      await callbackSubmit.sendEmail(
        {
          firstName: callbackFormData.firstName,
          lastName: callbackFormData.lastName,
          message,
          phone: callbackFormData.phone,
          email: callbackFormData.email,
          company: callbackFormData.company,
          submissionType: "callback",
          desiredDateTime: callbackFormData.dateTime,
          notes: callbackFormData.notes,
          subject: `User Request - Callback`,
        },
        "User - Callback Submitted",
      );
    },
    [callbackFormData, callbackSubmit, validateAndShowError, tMessages],
  );

  const handleOtherSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      const dataToValidate = { ...otherFormData, mode: "other" };

      if (
        !validateAndShowError(OtherFormDataSchema, dataToValidate, setOtherErrors, () => {
          otherSubmit.setButtonState("error");
          otherSubmit.showErrorToast(tMessages("errorDesc"));
          otherSubmit.resetButtonState();
        })
      ) {
        return;
      }

      const topicValue = tOtherForm(`topics.${otherFormData.topic}`);

      await otherSubmit.sendEmail(
        {
          firstName: otherFormData.firstName,
          lastName: otherFormData.lastName || "",
          message: otherFormData.message,
          email: otherFormData.email,
          phone: otherFormData.phone,
          submissionType: "other",
          subject: otherFormData.subject,
          topic: topicValue,
        },
        "User - Other Submitted",
      );
    },
    [otherFormData, otherSubmit, validateAndShowError, tMessages, tOtherForm],
  );

  return {
    formData,
    setFormData,
    otherFormData,
    setOtherFormData,
    callbackFormData,
    setCallbackFormData,
    errors,
    otherErrors,
    callbackErrors,
    getButtonState,
    messageButtonState: messageSubmit.buttonState,
    callbackButtonState: callbackSubmit.buttonState,
    otherButtonState: otherSubmit.buttonState,
    isSignedIn,
    accountProfile,
    accountPrefillState,
    applyAccountProfile,
    handleMessageSubmit,
    handleCallbackSubmit,
    handleOtherSubmit,
  };
}
