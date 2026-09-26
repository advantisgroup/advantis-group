"use client";
import { type FormEvent, useState, useCallback, useEffect, useMemo } from "react";

import { useUser } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { type z } from "zod";

import { type AccountMetadata } from "@/lib/account";
import { FormDataSchema, OtherFormDataSchema, CallbackFormDataSchema } from "@/lib/schema";
import {
  type AccountContactProfile,
  type FormData,
  type OtherFormData,
  type CallbackFormData,
  type ContactMode,
} from "@/types/contact";

import { type SentInquiry, useEmailSubmit } from "./use-email-submit";

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

// signing in from /contact (Google redirect included) reloads the page; the draft rides along
const DRAFT_KEY = "contact-draft";

type Draft = { message: FormData; other: OtherFormData; callback: CallbackFormData };

function readDraft(): Partial<Draft> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Draft>) : {};
  } catch {
    return {};
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // private mode or blocked storage: the form just doesn't survive a reload
  }
}

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
  // what just went out, so the page can swap the form for a confirmation
  const [sent, setSent] = useState<(SentInquiry & { mode: ContactMode; email: string }) | null>(
    null,
  );
  const messageSubmit = useEmailSubmit();
  const callbackSubmit = useEmailSubmit();
  const otherSubmit = useEmailSubmit();

  const accountProfile = useMemo<AccountContactProfile | null>(() => {
    if (!isSignedIn || !user) {
      return null;
    }

    const metadata = (user.unsafeMetadata ?? {}) as AccountMetadata;
    return {
      email: user.primaryEmailAddress?.emailAddress || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" "),
      company: metadata.company ?? "",
      phone: metadata.phone ?? "",
    };
  }, [isSignedIn, user]);

  // bring back what was typed before a sign-in reloaded the page
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    const draft = readDraft();
    if (draft.message) setFormData((current) => ({ ...current, ...draft.message }));
    if (draft.other) setOtherFormData((current) => ({ ...current, ...draft.other }));
    if (draft.callback) setCallbackFormData((current) => ({ ...current, ...draft.callback }));
    setDraftRestored(true);
  }, []);

  useEffect(() => {
    if (!draftRestored) return;
    writeDraft({ message: formData, other: otherFormData, callback: callbackFormData });
  }, [draftRestored, formData, otherFormData, callbackFormData]);

  // fill contact details from the account once it loads, without touching anything already typed
  useEffect(() => {
    if (!accountProfile || !draftRestored) return;

    const fill = <
      T extends { firstName: string; lastName?: string; email: string; phone?: string },
    >(
      current: T,
    ) => ({
      ...current,
      firstName: current.firstName || accountProfile.firstName,
      lastName: current.lastName || accountProfile.lastName,
      email: current.email || accountProfile.email,
      phone: current.phone || accountProfile.phone,
    });
    const withCompany = <T extends { company: string }>(current: T) => ({
      ...current,
      company: current.company || accountProfile.company,
    });

    setFormData((current) => withCompany(fill(current)));
    setOtherFormData(fill);
    setCallbackFormData((current) => withCompany(fill(current)));
  }, [accountProfile, draftRestored]);

  const markSent = useCallback(
    (mode: ContactMode, email: string, result: SentInquiry) => {
      setSent({ ...result, mode, email });

      const keepAccount = <T>(initial: T) => ({
        ...initial,
        firstName: accountProfile?.firstName ?? "",
        lastName: accountProfile?.lastName ?? "",
        email: accountProfile?.email ?? "",
        phone: accountProfile?.phone ?? "",
      });
      const keepCompany = <T extends { company: string }>(initial: T) => ({
        ...keepAccount(initial),
        company: accountProfile?.company ?? "",
      });

      if (mode === "message") setFormData(keepCompany(initialFormData));
      if (mode === "callback") setCallbackFormData(keepCompany(initialCallbackFormData));
      if (mode === "other") setOtherFormData(keepAccount(initialOtherFormData));
    },
    [accountProfile],
  );
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
        // the toast says something's wrong; the cursor should land on what
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus(),
        );

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

      const result = await messageSubmit.sendEmail(
        {
          firstName: formData.firstName,
          lastName: formData.lastName,
          message: formData.message,
          email: formData.email,
          phone: formData.phone,
          company: formData.company,
          submissionType: "message",
        },
        "User - Message Submitted",
        (field) => setErrors({ [field]: ["invalid"] }),
      );
      if (result) markSent("message", formData.email, result);
    },
    [formData, messageSubmit, validateAndShowError, tMessages, markSent],
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

      // datetime-local is the browser's wall clock, so its zone goes along with it
      const result = await callbackSubmit.sendEmail(
        {
          firstName: callbackFormData.firstName,
          lastName: callbackFormData.lastName,
          message: "",
          phone: callbackFormData.phone,
          email: callbackFormData.email,
          company: callbackFormData.company,
          submissionType: "callback",
          desiredAt: new Date(callbackFormData.dateTime).getTime(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          notes: callbackFormData.notes,
        },
        "User - Callback Submitted",
        (field) => setCallbackErrors({ [field]: [field === "dateTime" ? "hours" : "invalid"] }),
      );
      if (result) markSent("callback", callbackFormData.email, result);
    },
    [callbackFormData, callbackSubmit, validateAndShowError, tMessages, markSent],
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

      const result = await otherSubmit.sendEmail(
        {
          firstName: otherFormData.firstName,
          lastName: otherFormData.lastName || "",
          message: otherFormData.message,
          email: otherFormData.email,
          phone: otherFormData.phone,
          submissionType: "other",
          subject: otherFormData.subject,
          topic: topicValue,
          topicKey: otherFormData.topic,
        },
        "User - Other Submitted",
        (field) => setOtherErrors({ [field]: ["invalid"] }),
      );
      if (result) markSent("other", otherFormData.email, result);
    },
    [otherFormData, otherSubmit, validateAndShowError, tMessages, tOtherForm, markSent],
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
    sent,
    clearSent: () => setSent(null),
    handleMessageSubmit,
    handleCallbackSubmit,
    handleOtherSubmit,
  };
}
