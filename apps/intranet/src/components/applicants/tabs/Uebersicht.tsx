"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

function Field({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Input
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
    </label>
  );
}

export function Uebersicht({
  applicant,
  highlight,
}: {
  applicant: ApplicantDetail;
  highlight: string[];
}) {
  const t = useTranslations("Applicants");
  const profiles = useQuery(api.applicants.listProfiles);
  const update = useMutation(api.applicants.update);
  const handleError = useErrorHandler();
  const [notiz, setNotiz] = useState(applicant.notizen ?? "");
  const isHighlighted = (skill: string) =>
    highlight.some(h => h.toLowerCase() === skill.toLowerCase());

  const profile = profiles?.find(p => p._id === applicant.profilId) ?? null;
  const matched = profile ? matchSkills(profile.skills, applicant) : [];
  const missing = profile
    ? profile.skills.filter(s => !matched.includes(s))
    : [];

  function patch(fields: Parameters<typeof update>[0]) {
    update(fields).catch(handleError);
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("masterData")}</p>
          <Field
            label={t("name")}
            value={applicant.name}
            onSave={v => patch({ applicantId: applicant._id, name: v })}
          />
          <Field
            label={t("email")}
            value={applicant.email ?? ""}
            onSave={v => patch({ applicantId: applicant._id, email: v })}
          />
          <Field
            label={t("phone")}
            value={applicant.telefon ?? ""}
            onSave={v => patch({ applicantId: applicant._id, telefon: v })}
          />
          <Field
            label={t("address")}
            value={applicant.adresse ?? ""}
            onSave={v => patch({ applicantId: applicant._id, adresse: v })}
          />
          <Field
            label={t("birthDate")}
            value={applicant.geburtsdatum ?? ""}
            onSave={v => patch({ applicantId: applicant._id, geburtsdatum: v })}
          />
          <Field
            label={t("position")}
            value={applicant.position ?? ""}
            onSave={v => patch({ applicantId: applicant._id, position: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">
            {t("skillMatch")}
            {profile &&
              ` – ${profile.name} (${matched.length}/${profile.skills.length})`}
          </p>
          {!profiles || profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noProfilesYet")}
            </p>
          ) : (
            <>
              <Select
                value={applicant.profilId ?? "none"}
                onValueChange={v =>
                  patch({
                    applicantId: applicant._id,
                    profilId:
                      v === "none" ? null : (v as Id<"applicantSkillProfiles">),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noProfileAssigned")}</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name} ({p.skills.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profile && profile.skills.length > 0 && (
                <div className="space-y-1 text-sm">
                  {matched.map(s => (
                    <div
                      key={s}
                      className={cn(
                        "flex items-center gap-2 rounded px-1 -mx-1",
                        isHighlighted(s) && "skill-hl"
                      )}
                    >
                      <span className="font-bold text-success">✓</span> {s}
                    </div>
                  ))}
                  {missing.map(s => (
                    <div
                      key={s}
                      className="flex items-center gap-2 text-muted-foreground"
                    >
                      <span className="font-bold text-destructive">✕</span> {s}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {applicant.skills.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("skillsFromDocuments")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {applicant.skills.map(s => (
                  <Badge
                    key={s}
                    variant="muted"
                    className={cn(isHighlighted(s) && "skill-hl")}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("profileFromDocuments")}</p>
          {applicant.zusammenfassung && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("summary")}
              </p>
              <p className="text-sm leading-relaxed">
                {applicant.zusammenfassung}
              </p>
            </div>
          )}
          {applicant.berufserfahrung && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("experience")}
              </p>
              <p className="text-sm leading-relaxed">
                {applicant.berufserfahrung}
              </p>
            </div>
          )}
          {applicant.ausbildung && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("education")}
              </p>
              <p className="text-sm leading-relaxed">{applicant.ausbildung}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("internalNotes")}</p>
          <Textarea
            className="min-h-32"
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            onBlur={() =>
              notiz !== (applicant.notizen ?? "") &&
              patch({ applicantId: applicant._id, notizen: notiz })
            }
            placeholder={t("internalNotesPlaceholder")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
