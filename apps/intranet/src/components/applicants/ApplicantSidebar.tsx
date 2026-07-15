"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";
import { Cake, Mail, MapPin, Phone, User } from "lucide-react";
import { useTranslations } from "next-intl";

import { AmpelPicker } from "@/components/applicants/AmpelBadge";
import {
  type ApplicantDetail,
  ensureRichHtml,
} from "@/components/applicants/applicant-types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

function Field({
  label,
  icon: Icon,
  value,
  multiline,
  onSave,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  multiline?: boolean;
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(value);
  const InputField = multiline ? Textarea : Input;
  return (
    <label className="block space-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      <InputField
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
        className={multiline ? "min-h-16" : undefined}
      />
    </label>
  );
}

/**
 * Persistent right rail on the applicant detail page: rating, contact data,
 * and internal notes are visible and editable from every tab instead of
 * living only on the overview. Address stays multi-line and notes use the
 * same rich-text editor as the overview's long-form fields, so nothing here
 * regresses the formatting/detail those fields already got.
 */
export function ApplicantSidebar({
  applicant,
  className,
}: {
  applicant: ApplicantDetail;
  className?: string;
}) {
  const t = useTranslations("Applicants");
  const update = useMutation(api.applicants.update);
  const handleError = useErrorHandler();
  const [notiz, setNotiz] = useState(() =>
    ensureRichHtml(applicant.notizen ?? "")
  );

  function patch(fields: Parameters<typeof update>[0]) {
    update(fields).catch(handleError);
  }

  return (
    <aside className={cn("space-y-4", className)}>
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("ourRating")}
          </p>
          <AmpelPicker
            value={applicant.rating}
            onChange={rating => patch({ applicantId: applicant._id, rating })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("contactData")}
          </p>
          <Field
            label={t("name")}
            icon={User}
            value={applicant.name}
            onSave={v => patch({ applicantId: applicant._id, name: v })}
          />
          <Field
            label={t("email")}
            icon={Mail}
            value={applicant.email ?? ""}
            onSave={v => patch({ applicantId: applicant._id, email: v })}
          />
          <Field
            label={t("phone")}
            icon={Phone}
            value={applicant.telefon ?? ""}
            onSave={v => patch({ applicantId: applicant._id, telefon: v })}
          />
          <Field
            label={t("address")}
            icon={MapPin}
            value={applicant.adresse ?? ""}
            multiline
            onSave={v => patch({ applicantId: applicant._id, adresse: v })}
          />
          <Field
            label={t("birthDate")}
            icon={Cake}
            value={applicant.geburtsdatum ?? ""}
            onSave={v => patch({ applicantId: applicant._id, geburtsdatum: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("internalNotes")}
          </p>
          <RichTextEditor
            value={notiz}
            onChange={setNotiz}
            onBlur={() =>
              notiz !== ensureRichHtml(applicant.notizen ?? "") &&
              patch({ applicantId: applicant._id, notizen: notiz })
            }
            placeholder={t("internalNotesPlaceholder")}
            minHeight="min-h-32"
          />
        </CardContent>
      </Card>
    </aside>
  );
}
