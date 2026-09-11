"use client";

import { type ReactNode, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  EMAIL_KATEGORIEN,
  KONTAKT_ARTEN,
  TERMIN_ARTEN,
  TERMIN_TYPEN,
  today,
} from "@/components/applicants/applicant-types";
import { FormDialog } from "@/components/compose/FormDialog";
import { useDraft } from "@/components/compose/use-draft";
import { DialogTip } from "@/components/ui/dialog";
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
import { formatIsoDate } from "@/lib/format";

/**
 * The "log an entry into the Akte" dialogs — Kontakt, E-Mail, Interview,
 * Termin. Small, quick forms, so they stay dialogs (a bottom sheet on
 * mobile); each note is kept as a draft per applicant, so closing the sheet
 * mid-sentence doesn't lose it.
 */

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: Id<"applicants">;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/* ── Kontakt ─────────────────────────────────────────────────────────────── */

interface KontaktValues {
  datum: string;
  art: (typeof KONTAKT_ARTEN)[number];
  notiz: string;
}

function KontaktForm({
  open,
  onOpenChange,
  applicantId,
  showFirstContactHint,
}: EntryDialogProps & { showFirstContactHint?: boolean }) {
  const t = useTranslations("Applicants");
  const addKontakt = useMutation(api.applicants.addKontakt);
  const handleError = useErrorHandler();
  const fresh = (): KontaktValues => ({ datum: today(), art: "telefon", notiz: "" });
  const [values, setValues] = useState<KontaktValues>(fresh);
  const [busy, setBusy] = useState(false);
  const draft = useDraft<KontaktValues>({
    surface: "applicantContact",
    subjectKey: applicantId,
    value: values,
    isEmpty: (v) => !v.notiz.trim(),
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  async function save() {
    setBusy(true);
    try {
      await addKontakt({
        applicantId,
        datum: values.datum,
        art: values.art,
        notiz: values.notiz.trim() || undefined,
      });
      await draft.clear();
      toast.success(t("kontaktSaved"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("logContact")}
      draft={draft}
      onStartOver={() => {
        const next = fresh();
        setValues(next);
        void draft.clear(next);
      }}
      checks={[
        { key: "date", label: t("date"), done: !!values.datum },
        { key: "note", label: t("note"), done: !!values.notiz.trim(), optional: true },
      ]}
      submitLabel={t("saveContact")}
      onSubmit={() => void save()}
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input
            type="date"
            value={values.datum}
            onChange={(e) => setValues((v) => ({ ...v, datum: e.target.value }))}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("entryKind")}</FieldLabel>
          <Select
            value={values.art}
            onValueChange={(art) => setValues((v) => ({ ...v, art: art as KontaktValues["art"] }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KONTAKT_ARTEN.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`kontaktArt.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Textarea
          value={values.notiz}
          onChange={(e) => setValues((v) => ({ ...v, notiz: e.target.value }))}
          placeholder={t("contactNotePlaceholder")}
        />
      </label>
      {showFirstContactHint && <DialogTip>{t("firstContactHint")}</DialogTip>}
    </FormDialog>
  );
}

export function KontaktDialog(props: EntryDialogProps & { showFirstContactHint?: boolean }) {
  // Mounted only while open, so each opening starts from the stored draft or
  // a blank form rather than stale local state.
  if (!props.open) return null;
  return <KontaktForm {...props} />;
}

/* ── E-Mail ──────────────────────────────────────────────────────────────── */

interface EmailValues {
  datum: string;
  kategorie: (typeof EMAIL_KATEGORIEN)[number];
  notiz: string;
}

function EmailForm({ open, onOpenChange, applicantId }: EntryDialogProps) {
  const t = useTranslations("Applicants");
  const addEmail = useMutation(api.applicants.addEmail);
  const handleError = useErrorHandler();
  const fresh = (): EmailValues => ({ datum: today(), kategorie: "sonstiges", notiz: "" });
  const [values, setValues] = useState<EmailValues>(fresh);
  const [busy, setBusy] = useState(false);
  const draft = useDraft<EmailValues>({
    surface: "applicantEmail",
    subjectKey: applicantId,
    value: values,
    isEmpty: (v) => !v.notiz.trim(),
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  async function save() {
    setBusy(true);
    try {
      await addEmail({
        applicantId,
        datum: values.datum,
        kategorie: values.kategorie,
        notiz: values.notiz.trim() || undefined,
      });
      await draft.clear();
      toast.success(t("emailSaved"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("logEmail")}
      draft={draft}
      onStartOver={() => {
        const next = fresh();
        setValues(next);
        void draft.clear(next);
      }}
      checks={[
        { key: "date", label: t("date"), done: !!values.datum },
        { key: "note", label: t("note"), done: !!values.notiz.trim(), optional: true },
      ]}
      submitLabel={t("saveEmail")}
      onSubmit={() => void save()}
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input
            type="date"
            value={values.datum}
            onChange={(e) => setValues((v) => ({ ...v, datum: e.target.value }))}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("entryKind")}</FieldLabel>
          <Select
            value={values.kategorie}
            onValueChange={(kategorie) =>
              setValues((v) => ({ ...v, kategorie: kategorie as EmailValues["kategorie"] }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_KATEGORIEN.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`emailKategorie.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Input
          value={values.notiz}
          onChange={(e) => setValues((v) => ({ ...v, notiz: e.target.value }))}
          placeholder={t("emailNotePlaceholder")}
        />
      </label>
      <DialogTip>{t("emailDoesNotCountHint")}</DialogTip>
    </FormDialog>
  );
}

export function EmailDialog(props: EntryDialogProps) {
  if (!props.open) return null;
  return <EmailForm {...props} />;
}

/* ── Interview ───────────────────────────────────────────────────────────── */

interface InterviewValues {
  datum: string;
  interviewer: string;
  notiz: string;
}

function InterviewForm({ open, onOpenChange, applicantId }: EntryDialogProps) {
  const t = useTranslations("Applicants");
  const addInterview = useMutation(api.applicants.addInterview);
  const handleError = useErrorHandler();
  const fresh = (): InterviewValues => ({ datum: today(), interviewer: "", notiz: "" });
  const [values, setValues] = useState<InterviewValues>(fresh);
  const [busy, setBusy] = useState(false);
  const draft = useDraft<InterviewValues>({
    surface: "applicantInterview",
    subjectKey: applicantId,
    value: values,
    isEmpty: (v) => !v.notiz.trim() && !v.interviewer.trim(),
    onRestore: (stored) => setValues((prev) => ({ ...prev, ...stored })),
  });

  async function save() {
    setBusy(true);
    try {
      await addInterview({
        applicantId,
        datum: values.datum,
        interviewer: values.interviewer,
        notiz: values.notiz.trim() || undefined,
      });
      await draft.clear();
      toast.success(t("interviewSaved"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("logInterview")}
      draft={draft}
      onStartOver={() => {
        const next = fresh();
        setValues(next);
        void draft.clear(next);
      }}
      checks={[
        { key: "date", label: t("date"), done: !!values.datum },
        {
          key: "interviewer",
          label: t("interviewer"),
          done: !!values.interviewer.trim(),
          optional: true,
        },
        { key: "note", label: t("note"), done: !!values.notiz.trim(), optional: true },
      ]}
      submitLabel={t("saveInterview")}
      onSubmit={() => void save()}
      busy={busy}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input
            type="date"
            value={values.datum}
            onChange={(e) => setValues((v) => ({ ...v, datum: e.target.value }))}
          />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>{t("interviewer")}</FieldLabel>
          <Input
            value={values.interviewer}
            onChange={(e) => setValues((v) => ({ ...v, interviewer: e.target.value }))}
            placeholder={t("interviewerPlaceholder")}
          />
        </label>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Textarea
          value={values.notiz}
          onChange={(e) => setValues((v) => ({ ...v, notiz: e.target.value }))}
          placeholder={t("interviewNotePlaceholder")}
        />
      </label>
    </FormDialog>
  );
}

export function InterviewDialog(props: EntryDialogProps) {
  if (!props.open) return null;
  return <InterviewForm {...props} />;
}

/* ── Termin ──────────────────────────────────────────────────────────────── */

/** Minimal applicant shape the Termin picker needs — structural on purpose
 * so both the calendar page and the detail tabs can feed it. */
export interface TerminApplicantOption {
  _id: Id<"applicants">;
  name: string;
  position?: string | null;
}

/** ISO date `n` workdays (Mon–Fri) from today, for the Wiedervorlage default. */
function addWorkdays(n: number): string {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6) added++;
  }
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface TerminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Choices for the applicant picker; ignored when `fixedApplicantId` is set. */
  applicants?: TerminApplicantOption[];
  fixedApplicantId?: Id<"applicants">;
}

function TerminForm({ open, onOpenChange, applicants = [], fixedApplicantId }: TerminDialogProps) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const createTermin = useMutation(api.applicants.createTermin);
  const handleError = useErrorHandler();

  const [applicantId, setApplicantId] = useState<string>(fixedApplicantId ?? "");
  const [datum, setDatum] = useState(today());
  const [uhrzeit, setUhrzeit] = useState("10:00");
  const [art, setArt] = useState<(typeof TERMIN_ARTEN)[number]>("telefon");
  const [typ, setTypRaw] = useState<(typeof TERMIN_TYPEN)[number]>("interview");
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);

  function setTyp(next: (typeof TERMIN_TYPEN)[number]) {
    setTypRaw(next);
    if (next === "wiedervorlage") setDatum(addWorkdays(3));
  }

  async function save() {
    setBusy(true);
    try {
      await createTermin({
        applicantId: applicantId as Id<"applicants">,
        datum,
        uhrzeit,
        art,
        typ,
        notiz: notiz.trim() || undefined,
      });
      toast.success(t("terminSaved"));
      onOpenChange(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("planTermin")}
      description={t("calendarDescription")}
      checks={[
        { key: "applicant", label: t("applicant"), done: !!applicantId },
        { key: "date", label: t("date"), done: !!datum },
        { key: "time", label: t("time"), done: !!uhrzeit },
      ]}
      submitLabel={t("saveTermin")}
      onSubmit={() => void save()}
      busy={busy}
    >
      {!fixedApplicantId && (
        <div className="space-y-1.5">
          <FieldLabel>{t("applicant")}</FieldLabel>
          <Select value={applicantId} onValueChange={setApplicantId}>
            <SelectTrigger>
              <SelectValue placeholder={t("chooseApplicant")} />
            </SelectTrigger>
            <SelectContent>
              {applicants.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name}
                  {a.position ? ` (${a.position})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>{t("time")}</FieldLabel>
          <Input type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("terminArtLabel")}</FieldLabel>
          <Select value={art} onValueChange={(v) => setArt(v as typeof art)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMIN_ARTEN.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`terminArt.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("terminTypLabel")}</FieldLabel>
          <Select value={typ} onValueChange={(v) => setTyp(v as typeof typ)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMIN_TYPEN.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {t(`terminTyp.${ty}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Input
          placeholder={t("terminNotePlaceholder")}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
        />
      </label>
      {typ === "wiedervorlage" && (
        <DialogTip>{t("wiedervorlageHint", { date: formatIsoDate(datum, locale) })}</DialogTip>
      )}
    </FormDialog>
  );
}

export function TerminDialog(props: TerminDialogProps) {
  if (!props.open) return null;
  return <TerminForm {...props} />;
}
