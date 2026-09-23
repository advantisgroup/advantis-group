import { Send } from "lucide-react";
import { useTranslations } from "next-intl";

import { type FormProps, type InquiryTopic, type OtherFormData } from "@/types/contact";

import { AnimatedButton } from "../ui/AnimatedButton";
import { Field, PrivacyNote, controlClassName, useFieldError } from "./Field";

const TOPICS: InquiryTopic[] = ["question", "withdrawal", "legal"];

export function OtherForm({
  formData,
  errors,
  buttonState,
  disabled = false,
  onFormDataChange,
  onSubmit,
}: FormProps<OtherFormData>) {
  const t = useTranslations("contact.form");
  const tOther = useTranslations("contact.otherForm");
  const errorFor = useFieldError(errors);

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <fieldset>
        <legend className="text-sm font-medium text-foreground">{tOther("topic")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <label
              key={topic}
              className="cursor-pointer rounded-full border border-rule-strong px-3.5 py-2 text-sm sm:py-1.5 text-muted-foreground transition-colors hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:text-background has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name="topic"
                value={topic}
                checked={formData.topic === topic}
                onChange={() => onFormDataChange({ ...formData, topic })}
                className="sr-only"
              />
              {tOther(`topics.${topic}`)}
            </label>
          ))}
        </div>
        {errors.topic ? (
          <p className="mt-1.5 text-[13px] text-destructive">{tOther("selectTopic")}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="other-firstName" label={t("firstName")} error={errorFor("firstName")}>
          <input
            id="other-firstName"
            autoComplete="given-name"
            value={formData.firstName}
            onChange={(e) => onFormDataChange({ ...formData, firstName: e.target.value })}
            aria-invalid={Boolean(errors.firstName)}
            className={controlClassName}
          />
        </Field>
        <Field id="other-lastName" label={t("lastName")} optional>
          <input
            id="other-lastName"
            autoComplete="family-name"
            value={formData.lastName ?? ""}
            onChange={(e) => onFormDataChange({ ...formData, lastName: e.target.value })}
            className={controlClassName}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="other-email" label={t("email")} error={errorFor("email")}>
          <input
            id="other-email"
            type="email"
            autoComplete="email"
            value={formData.email}
            onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            className={controlClassName}
          />
        </Field>
        <Field id="other-phone" label={t("phone")} optional>
          <input
            id="other-phone"
            type="tel"
            autoComplete="tel"
            value={formData.phone ?? ""}
            onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
            className={controlClassName}
          />
        </Field>
      </div>

      <Field id="other-subject" label={tOther("subject")} error={errorFor("subject")}>
        <input
          id="other-subject"
          value={formData.subject}
          onChange={(e) => onFormDataChange({ ...formData, subject: e.target.value })}
          placeholder={tOther("subjectPlaceholder")}
          aria-invalid={Boolean(errors.subject)}
          className={controlClassName}
        />
      </Field>

      <Field id="other-message" label={t("message")} error={errorFor("message")}>
        <textarea
          id="other-message"
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
