"use client";

import { useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { matchSkills } from "@advantis/types";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Download, Trash2, UploadCloud } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AmpelPicker } from "@/components/applicants/AmpelBadge";
import { TerminForm, TerminRow } from "@/components/applicants/TerminCalendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatIsoDate } from "@/lib/format";

import type { FunctionReturnType } from "convex/server";

type ApplicantDetail = NonNullable<
  FunctionReturnType<typeof api.applicants.get>
>;

const KONTAKT_ARTEN = ["telefon", "email", "persoenlich", "video", "sonstiges"] as const;
const EMAIL_KATEGORIEN = [
  "telefonisch_nicht_erreicht",
  "einladung",
  "absage",
  "sonstiges",
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function TabUebersicht({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const profiles = useQuery(api.applicants.listProfiles);
  const update = useMutation(api.applicants.update);
  const handleError = useErrorHandler();
  const [notiz, setNotiz] = useState(applicant.notizen ?? "");

  const profile = profiles?.find(p => p._id === applicant.profilId) ?? null;
  const matched = profile ? matchSkills(profile.skills, applicant) : [];
  const missing = profile ? profile.skills.filter(s => !matched.includes(s)) : [];

  function patch(fields: Parameters<typeof update>[0]) {
    update(fields).catch(handleError);
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("masterData")}</p>
          <Field label={t("name")} value={applicant.name} onSave={v => patch({ applicantId: applicant._id, name: v })} />
          <Field label={t("email")} value={applicant.email ?? ""} onSave={v => patch({ applicantId: applicant._id, email: v })} />
          <Field label={t("phone")} value={applicant.telefon ?? ""} onSave={v => patch({ applicantId: applicant._id, telefon: v })} />
          <Field label={t("address")} value={applicant.adresse ?? ""} onSave={v => patch({ applicantId: applicant._id, adresse: v })} />
          <Field label={t("birthDate")} value={applicant.geburtsdatum ?? ""} onSave={v => patch({ applicantId: applicant._id, geburtsdatum: v })} />
          <Field label={t("position")} value={applicant.position ?? ""} onSave={v => patch({ applicantId: applicant._id, position: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">
            {t("skillMatch")}
            {profile && ` – ${profile.name} (${matched.length}/${profile.skills.length})`}
          </p>
          {!profiles || profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noProfilesYet")}</p>
          ) : (
            <>
              <Select
                value={applicant.profilId ?? "none"}
                onValueChange={v =>
                  patch({
                    applicantId: applicant._id,
                    profilId: v === "none" ? null : (v as Id<"applicantSkillProfiles">),
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
                    <div key={s} className="flex items-center gap-2">
                      <span className="font-bold text-success">✓</span> {s}
                    </div>
                  ))}
                  {missing.map(s => (
                    <div key={s} className="flex items-center gap-2 text-muted-foreground">
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
                  <Badge key={s} variant="muted">
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
              <p className="text-sm leading-relaxed">{applicant.zusammenfassung}</p>
            </div>
          )}
          {applicant.berufserfahrung && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("experience")}
              </p>
              <p className="text-sm leading-relaxed">{applicant.berufserfahrung}</p>
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
            onBlur={() => notiz !== (applicant.notizen ?? "") && patch({ applicantId: applicant._id, notizen: notiz })}
            placeholder={t("internalNotesPlaceholder")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TabTermine({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const sorted = [...applicant.termine].sort((a, b) =>
    (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit)
  );
  const kommend = sorted.filter(tm => tm.datum >= today());
  const vergangen = sorted.filter(tm => tm.datum < today()).reverse();

  return (
    <div className="space-y-5">
      <TerminForm applicants={[]} fixedApplicantId={applicant._id} />
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">
            {t("upcomingTermine")} ({kommend.length})
          </p>
          {kommend.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUpcomingTermine")}</p>
          ) : (
            kommend.map(tm => <TerminRow key={tm._id} termin={tm} />)
          )}
        </CardContent>
      </Card>
      {vergangen.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">
              {t("pastTermine")} ({vergangen.length})
            </p>
            {vergangen.map(tm => (
              <TerminRow key={tm._id} termin={tm} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TabDokumente({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const generateUploadUrl = useMutation(api.applicants.generateUploadUrl);
  const addDocument = useMutation(api.applicants.addDocument);
  const removeDocument = useMutation(api.applicants.removeDocument);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const tc = useTranslations("Common");

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error(t("uploadPdfOnly"));
      return;
    }
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await addDocument({ applicantId: applicant._id, storageId, fileName: file.name });
      toast.success(t("documentAdded"));
    } catch (e) {
      handleError(e);
    }
  }

  async function handleRemove(documentId: Id<"applicantDocuments">, name: string) {
    const ok = await confirm({
      title: t("deleteDocument"),
      description: t("deleteDocumentConfirm", { name }),
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    removeDocument({ documentId }).catch(handleError);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm font-semibold">{t("documentsInFile")}</p>
        {applicant.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noDocumentsYet")}</p>
        ) : (
          <div className="space-y-2">
            {applicant.documents.map(d => (
              <div
                key={d._id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("uploadedOn", { date: new Date(d.createdAt).toLocaleDateString() })}
                  </p>
                </div>
                {d.url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={d.url} download={d.fileName}>
                      <Download className="size-4" />
                      {t("download")}
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void handleRemove(d._id, d.fileName)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <label>
          <Button asChild variant="outline">
            <span>
              <UploadCloud className="size-4" />
              {t("addDocument")}
            </span>
          </Button>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => {
              void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("maxFileSizeHint")}</p>
      </CardContent>
    </Card>
  );
}

function TabKontakte({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const addKontakt = useMutation(api.applicants.addKontakt);
  const removeKontakt = useMutation(api.applicants.removeKontakt);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [art, setArt] = useState<(typeof KONTAKT_ARTEN)[number]>("telefon");
  const [notiz, setNotiz] = useState("");

  function save() {
    addKontakt({ applicantId: applicant._id, datum, art, notiz: notiz.trim() || undefined })
      .then(() => setNotiz(""))
      .catch(handleError);
  }

  return (
    <div className="space-y-5">
      {applicant.status === "neu" && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          {t("firstContactHint")}
        </div>
      )}
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("logContact")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
            <Select value={art} onValueChange={v => setArt(v as typeof art)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KONTAKT_ARTEN.map(a => (
                  <SelectItem key={a} value={a}>
                    {t(`kontaktArt.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={save}>{t("saveContact")}</Button>
          </div>
          <Textarea
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={t("contactNotePlaceholder")}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">{t("contactHistory")}</p>
          {applicant.kontakte.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noContactsYet")}</p>
          ) : (
            applicant.kontakte.map(k => (
              <div
                key={k._id}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t(`kontaktArt.${k.art}`)} · {formatIsoDate(k.datum, "de-DE")}
                  </p>
                  {k.notiz && <p className="mt-1 text-muted-foreground">{k.notiz}</p>}
                </div>
                <button
                  aria-label={t("deleteEntry")}
                  onClick={() => removeKontakt({ kontaktId: k._id }).catch(handleError)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TabEmails({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const addEmail = useMutation(api.applicants.addEmail);
  const removeEmail = useMutation(api.applicants.removeEmail);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [kategorie, setKategorie] = useState<(typeof EMAIL_KATEGORIEN)[number]>("sonstiges");
  const [notiz, setNotiz] = useState("");

  function save() {
    addEmail({ applicantId: applicant._id, datum, kategorie, notiz: notiz.trim() || undefined })
      .then(() => setNotiz(""))
      .catch(handleError);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("logEmail")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
            <Select value={kategorie} onValueChange={v => setKategorie(v as typeof kategorie)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_KATEGORIEN.map(k => (
                  <SelectItem key={k} value={k}>
                    {t(`emailKategorie.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={save}>{t("saveEmail")}</Button>
          </div>
          <Input
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={t("emailNotePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("emailDoesNotCountHint")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">{t("emailHistory")}</p>
          {applicant.emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEmailsYet")}</p>
          ) : (
            applicant.emails.map(m => (
              <div
                key={m._id}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatIsoDate(m.datum, "de-DE")} · {t(`emailKategorie.${m.kategorie}`)}
                  </p>
                  {m.notiz && <p className="mt-1 text-muted-foreground">{m.notiz}</p>}
                </div>
                <button
                  aria-label={t("deleteEntry")}
                  onClick={() => removeEmail({ emailId: m._id }).catch(handleError)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TabInterviews({ applicant }: { applicant: ApplicantDetail }) {
  const t = useTranslations("Applicants");
  const addInterview = useMutation(api.applicants.addInterview);
  const removeInterview = useMutation(api.applicants.removeInterview);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [interviewer, setInterviewer] = useState("");
  const [notiz, setNotiz] = useState("");

  function save() {
    addInterview({ applicantId: applicant._id, datum, interviewer, notiz: notiz.trim() || undefined })
      .then(() => {
        setInterviewer("");
        setNotiz("");
      })
      .catch(handleError);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-semibold">{t("logInterview")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
            <Input
              placeholder={t("interviewerPlaceholder")}
              value={interviewer}
              onChange={e => setInterviewer(e.target.value)}
            />
            <Button onClick={save}>{t("saveInterview")}</Button>
          </div>
          <Textarea
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder={t("interviewNotePlaceholder")}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-semibold">{t("interviewHistory")}</p>
          {applicant.interviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noInterviewsYet")}</p>
          ) : (
            applicant.interviews.map(iv => (
              <div
                key={iv._id}
                className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t("interviewOn", { date: formatIsoDate(iv.datum, "de-DE") })}
                    {iv.interviewer ? ` · ${iv.interviewer}` : ""}
                  </p>
                  {iv.notiz && <p className="mt-1 text-muted-foreground">{iv.notiz}</p>}
                </div>
                <button
                  aria-label={t("deleteEntry")}
                  onClick={() => removeInterview({ interviewId: iv._id }).catch(handleError)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ApplicantDetailPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = useLocale();
  const applicantId = params.id as Id<"applicants">;
  const applicant = useQuery(api.applicants.get, { applicantId });
  const update = useMutation(api.applicants.update);
  const remove = useMutation(api.applicants.remove);
  const handleError = useErrorHandler();
  const confirm = useConfirm();

  async function handleDelete() {
    if (!applicant) return;
    const ok = await confirm({
      title: t("deleteApplicant"),
      description: t("deleteApplicantConfirm", { name: applicant.name }),
      confirmText: { target: applicant.name },
      confirmLabel: tc("delete"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    remove({ applicantId })
      .then(() => {
        toast.success(t("applicantDeleted"));
        router.push("/applicants");
      })
      .catch(handleError);
  }

  if (applicant === undefined) return null;
  if (applicant === null) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        {t("applicantNotFound")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Button variant="ghost" onClick={() => router.push("/applicants")}>
        <ArrowLeft className="size-4" />
        {t("backToList")}
      </Button>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {applicant.name}
              </h1>
              <Badge variant={applicant.status === "neu" ? "default" : "muted"}>
                {applicant.status === "neu" ? t("statusNeu") : t("statusPool")}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {applicant.position || t("positionUnknown")} ·{" "}
              {t("receivedOn", {
                date: formatIsoDate(new Date(applicant.createdAt).toISOString().slice(0, 10), locale),
              })}
            </p>
          </div>
          <div className="space-y-1.5 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("ourRating")}
            </p>
            <AmpelPicker
              value={applicant.rating}
              onChange={rating => update({ applicantId, rating }).catch(handleError)}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs key={applicant._id} defaultValue="uebersicht">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="grid grid-cols-3 sm:inline-flex">
            <TabsTrigger value="uebersicht">{t("tabOverview")}</TabsTrigger>
            <TabsTrigger value="termine">
              {t("tabTermine")} ({applicant.termine.filter(tm => !tm.uebernommen).length})
            </TabsTrigger>
            <TabsTrigger value="dokumente">
              {t("tabDocuments")} ({applicant.documents.length})
            </TabsTrigger>
            <TabsTrigger value="kontakte">
              {t("tabKontakte")} ({applicant.kontakte.length})
            </TabsTrigger>
            <TabsTrigger value="emails">
              {t("tabEmails")} ({applicant.emails.length})
            </TabsTrigger>
            <TabsTrigger value="interviews">
              {t("tabInterviews")} ({applicant.interviews.length})
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-4" />
            {t("deleteApplicant")}
          </Button>
        </div>

        <TabsContent value="uebersicht">
          <TabUebersicht applicant={applicant} />
        </TabsContent>
        <TabsContent value="termine">
          <TabTermine applicant={applicant} />
        </TabsContent>
        <TabsContent value="dokumente">
          <TabDokumente applicant={applicant} />
        </TabsContent>
        <TabsContent value="kontakte">
          <TabKontakte applicant={applicant} />
        </TabsContent>
        <TabsContent value="emails">
          <TabEmails applicant={applicant} />
        </TabsContent>
        <TabsContent value="interviews">
          <TabInterviews applicant={applicant} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
