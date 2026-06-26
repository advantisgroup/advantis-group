import React from "react";

import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { type FormProps, type CallbackFormData } from "@/types/contact";

import { BrandText } from "../effects/BrandText";
import { AnimatedButton } from "../ui/AnimatedButton";

export function CallbackForm({
  formData,
  errors,
  buttonState,
  disabled = false,
  onFormDataChange,
  onSubmit,
}: FormProps<CallbackFormData>) {
  const t = useTranslations("contact.form");

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label
          htmlFor="callback-company"
          className="block text-sm font-medium mb-2"
        >
          {t("company")} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="callback-company"
          value={formData.company}
          onChange={e =>
            onFormDataChange({ ...formData, company: e.target.value })
          }
          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
          required
        />
        {errors.company && (
          <p className="text-red-500 text-sm mt-1">{errors.company[0]}</p>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-1/2">
          <label
            htmlFor="callback-firstName"
            className="block text-sm font-medium mb-2"
          >
            {t("firstName")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="callback-firstName"
            value={formData.firstName}
            onChange={e =>
              onFormDataChange({ ...formData, firstName: e.target.value })
            }
            className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
            required
          />
          {errors.firstName && (
            <p className="text-red-500 text-sm mt-1">{errors.firstName[0]}</p>
          )}
        </div>
        <div className="w-full md:w-1/2">
          <label
            htmlFor="callback-lastName"
            className="block text-sm font-medium mb-2"
          >
            {t("lastName")} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="callback-lastName"
            value={formData.lastName}
            onChange={e =>
              onFormDataChange({ ...formData, lastName: e.target.value })
            }
            className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
            required
          />
          {errors.lastName && (
            <p className="text-red-500 text-sm mt-1">{errors.lastName[0]}</p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="callback-phone"
          className="block text-sm font-medium mb-2"
        >
          {t("phone")} <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          id="callback-phone"
          value={formData.phone}
          onChange={e =>
            onFormDataChange({ ...formData, phone: e.target.value })
          }
          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
          placeholder={process.env.NEXT_PUBLIC_PHONE_NUMBER}
          required
        />
        {errors.phone && (
          <p className="text-red-500 text-sm mt-1">{errors.phone[0]}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="callback-email"
          className="block text-sm font-medium mb-2"
        >
          {t("email")} <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          id="callback-email"
          value={formData.email}
          onChange={e =>
            onFormDataChange({ ...formData, email: e.target.value })
          }
          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
          required
        />
        {errors.email && (
          <p className="text-red-500 text-sm mt-1">{errors.email[0]}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {t("callbackEmailNote")}
        </p>
      </div>

      <div>
        <label
          htmlFor="callback-datetime"
          className="block text-sm font-medium mb-2"
        >
          {t("desiredTime")} <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          id="callback-datetime"
          value={formData.dateTime}
          onChange={e =>
            onFormDataChange({ ...formData, dateTime: e.target.value })
          }
          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-base"
          required
        />
        {errors.dateTime && (
          <p className="text-red-500 text-sm mt-1">{errors.dateTime[0]}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {t("callbackTimeNote")}
        </p>
      </div>

      <div>
        <label
          htmlFor="callback-notes"
          className="block text-sm font-medium mb-2"
        >
          {t("notes")}
        </label>
        <textarea
          id="callback-notes"
          value={formData.notes || ""}
          onChange={e =>
            onFormDataChange({ ...formData, notes: e.target.value })
          }
          rows={3}
          className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none text-base"
          placeholder={t("notesPlaceholder")}
        />
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          <strong>{t("privacyNoteLabel")}</strong> {t("privacyPrefix")}{" "}
          <BrandText brand="advantis">Advantis Group GmbH</BrandText>{" "}
          {t("privacySuffixCallback")}{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            {t("privacyLink")}
          </Link>
        </p>
        <AnimatedButton
          buttonState={buttonState}
          idleText={t("callbackRequest")}
          idleIcon={Phone}
          disabled={disabled}
        />
      </div>
    </form>
  );
}
