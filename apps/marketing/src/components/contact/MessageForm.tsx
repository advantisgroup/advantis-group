import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { type FormData, type FormProps } from "@/types/contact";

import { AnimatedButton } from "../ui/AnimatedButton";
import { Field, PrivacyNote, controlClassName, useFieldError } from "./Field";

export function MessageForm({
  formData,
  errors,
  buttonState,
  disabled = false,
  onFormDataChange,
  onSubmit,
}: FormProps<FormData>) {
  const t = useTranslations("contact.form");
  const errorFor = useFieldError(errors);

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="firstName" label={t("firstName")} error={errorFor("firstName")}>
          <input
            id="firstName"
            autoComplete="given-name"
            value={formData.firstName}
            onChange={(e) => onFormDataChange({ ...formData, firstName: e.target.value })}
            aria-invalid={Boolean(errors.firstName)}
            className={controlClassName}
          />
        </Field>
        <Field id="lastName" label={t("lastName")} error={errorFor("lastName")}>
          <input
            id="lastName"
            autoComplete="family-name"
            value={formData.lastName}
            onChange={(e) => onFormDataChange({ ...formData, lastName: e.target.value })}
            aria-invalid={Boolean(errors.lastName)}
            className={controlClassName}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="email" label={t("email")} error={errorFor("email")}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            className={controlClassName}
          />
        </Field>
        <Field id="phone" label={t("phone")} optional>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={formData.phone ?? ""}
            onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
            className={controlClassName}
          />
        </Field>
      </div>

      <Field id="company" label={t("company")} error={errorFor("company")}>
        <input
          id="company"
          autoComplete="organization"
          value={formData.company}
          onChange={(e) => onFormDataChange({ ...formData, company: e.target.value })}
          aria-invalid={Boolean(errors.company)}
          className={controlClassName}
        />
      </Field>

      <Field id="message" label={t("message")} error={errorFor("message")}>
        <textarea
          id="message"
          rows={6}
          value={formData.message}
          onChange={(e) => onFormDataChange({ ...formData, message: e.target.value })}
          aria-invalid={Boolean(errors.message)}
          className={`${controlClassName} min-h-36 resize-y`}
        />
      </Field>

      <div className="space-y-4 pt-1">
        <PrivacyNote />
        <AnimatedButton
          buttonState={buttonState}
          idleText={t("submit")}
          idleIcon={Send}
          disabled={disabled}
          className="sm:w-auto sm:min-w-44"
        />
      </div>
    </form>
  );
}
