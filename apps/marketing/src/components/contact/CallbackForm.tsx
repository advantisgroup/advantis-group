import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { type CallbackFormData, type FormProps } from "@/types/contact";

import { AnimatedButton } from "../ui/AnimatedButton";
import { Field, PrivacyNote, controlClassName, useFieldError } from "./Field";

// earliest bookable slot is "now", in the local-time format datetime-local expects
const nowForInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

export function CallbackForm({
  formData,
  errors,
  buttonState,
  disabled = false,
  onFormDataChange,
  onSubmit,
}: FormProps<CallbackFormData>) {
  const t = useTranslations("contact.form");
  const errorFor = useFieldError(errors);

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="callback-firstName" label={t("firstName")} error={errorFor("firstName")}>
          <input
            id="callback-firstName"
            autoComplete="given-name"
            value={formData.firstName}
            onChange={(e) => onFormDataChange({ ...formData, firstName: e.target.value })}
            aria-invalid={Boolean(errors.firstName)}
            className={controlClassName}
          />
        </Field>
        <Field id="callback-lastName" label={t("lastName")} error={errorFor("lastName")}>
          <input
            id="callback-lastName"
            autoComplete="family-name"
            value={formData.lastName}
            onChange={(e) => onFormDataChange({ ...formData, lastName: e.target.value })}
            aria-invalid={Boolean(errors.lastName)}
            className={controlClassName}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="callback-phone" label={t("phone")} error={errorFor("phone")}>
          <input
            id="callback-phone"
            type="tel"
            autoComplete="tel"
            value={formData.phone}
            onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
            aria-invalid={Boolean(errors.phone)}
            placeholder={t("phonePlaceholder")}
            className={controlClassName}
          />
        </Field>
        <Field
          id="callback-email"
          label={t("email")}
          error={errorFor("email")}
          hint={t("callbackEmailNote")}
        >
          <input
            id="callback-email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            className={controlClassName}
          />
        </Field>
      </div>

      <Field id="callback-company" label={t("company")} error={errorFor("company")}>
        <input
          id="callback-company"
          autoComplete="organization"
          value={formData.company}
          onChange={(e) => onFormDataChange({ ...formData, company: e.target.value })}
          aria-invalid={Boolean(errors.company)}
          className={controlClassName}
        />
      </Field>

      <Field
        id="callback-datetime"
        label={t("desiredTime")}
        error={errorFor("dateTime")}
        hint={t("callbackTimeNote")}
      >
        <input
          id="callback-datetime"
          type="datetime-local"
          min={nowForInput()}
          suppressHydrationWarning
          value={formData.dateTime}
          onChange={(e) => onFormDataChange({ ...formData, dateTime: e.target.value })}
          aria-invalid={Boolean(errors.dateTime)}
          // iOS centres the value and draws it as a pill otherwise
          className={`${controlClassName} appearance-none text-left [&::-webkit-date-and-time-value]:text-left`}
        />
      </Field>

      <Field id="callback-notes" label={t("notes")}>
        <textarea
          id="callback-notes"
          rows={3}
          value={formData.notes ?? ""}
          onChange={(e) => onFormDataChange({ ...formData, notes: e.target.value })}
          placeholder={t("notesPlaceholder")}
          className={`${controlClassName} resize-y`}
        />
      </Field>

      <div className="space-y-4 pt-1">
        <PrivacyNote callback />
        <AnimatedButton
          buttonState={buttonState}
          idleText={t("callbackRequest")}
          idleIcon={Phone}
          disabled={disabled}
          className="sm:w-auto sm:min-w-44"
        />
      </div>
    </form>
  );
}
