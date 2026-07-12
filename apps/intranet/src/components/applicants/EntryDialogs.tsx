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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTip,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * The "log an entry into the Akte" dialogs — Kontakt, E-Mail, Interview.
 * These used to be always-visible inline form cards on the detail tabs;
 * as dialogs the tabs stay pure overviews and the same actions are also
 * reachable from the detail header's quick-add menu. The Termin equivalent
 * (`TerminDialog`) lives in `TerminCalendar.tsx` because it shares its form
 * with the calendar page.
 */

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: Id<"applicants">;
}

function EntryDialogShell({
  open,
  onOpenChange,
  title,
  description,
  tip,
  saveLabel,
  saveDisabled,
  onSave,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  tip?: ReactNode;
  saveLabel: string;
  saveDisabled?: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const tc = useTranslations("Common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="border-b border-border/70 px-6 pb-4 pr-12 pt-6">
          <DialogTitle className="leading-snug">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-1 leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </div>
        <div className="flex flex-col gap-4 px-6 pb-5 pt-4">
          {children}
          {tip && <DialogTip>{tip}</DialogTip>}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={saveDisabled} onClick={onSave}>
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/* ── Kontakt ─────────────────────────────────────────────────────────────── */

function KontaktForm({
  open,
  onOpenChange,
  applicantId,
  showFirstContactHint,
}: EntryDialogProps & { showFirstContactHint?: boolean }) {
  const t = useTranslations("Applicants");
  const addKontakt = useMutation(api.applicants.addKontakt);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [art, setArt] = useState<(typeof KONTAKT_ARTEN)[number]>("telefon");
  const [notiz, setNotiz] = useState("");

  function save() {
    addKontakt({
      applicantId,
      datum,
      art,
      notiz: notiz.trim() || undefined,
    })
      .then(() => {
        toast.success(t("kontaktSaved"));
        onOpenChange(false);
      })
      .catch(handleError);
  }

  return (
    <EntryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("logContact")}
      tip={showFirstContactHint ? t("firstContactHint") : undefined}
      saveLabel={t("saveContact")}
      onSave={save}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("entryKind")}</FieldLabel>
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
        </div>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Textarea
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder={t("contactNotePlaceholder")}
        />
      </label>
    </EntryDialogShell>
  );
}

export function KontaktDialog(
  props: EntryDialogProps & { showFirstContactHint?: boolean }
) {
  // Mounted only while open so each opening starts from a blank form.
  if (!props.open) return null;
  return <KontaktForm {...props} />;
}

/* ── E-Mail ──────────────────────────────────────────────────────────────── */

function EmailForm({ open, onOpenChange, applicantId }: EntryDialogProps) {
  const t = useTranslations("Applicants");
  const addEmail = useMutation(api.applicants.addEmail);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [kategorie, setKategorie] =
    useState<(typeof EMAIL_KATEGORIEN)[number]>("sonstiges");
  const [notiz, setNotiz] = useState("");

  function save() {
    addEmail({
      applicantId,
      datum,
      kategorie,
      notiz: notiz.trim() || undefined,
    })
      .then(() => {
        toast.success(t("emailSaved"));
        onOpenChange(false);
      })
      .catch(handleError);
  }

  return (
    <EntryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("logEmail")}
      tip={t("emailDoesNotCountHint")}
      saveLabel={t("saveEmail")}
      onSave={save}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("entryKind")}</FieldLabel>
          <Select
            value={kategorie}
            onValueChange={v => setKategorie(v as typeof kategorie)}
          >
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
        </div>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Input
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder={t("emailNotePlaceholder")}
        />
      </label>
    </EntryDialogShell>
  );
}

export function EmailDialog(props: EntryDialogProps) {
  if (!props.open) return null;
  return <EmailForm {...props} />;
}

/* ── Interview ───────────────────────────────────────────────────────────── */

function InterviewForm({ open, onOpenChange, applicantId }: EntryDialogProps) {
  const t = useTranslations("Applicants");
  const addInterview = useMutation(api.applicants.addInterview);
  const handleError = useErrorHandler();
  const [datum, setDatum] = useState(today());
  const [interviewer, setInterviewer] = useState("");
  const [notiz, setNotiz] = useState("");

  function save() {
    addInterview({
      applicantId,
      datum,
      interviewer,
      notiz: notiz.trim() || undefined,
    })
      .then(() => {
        toast.success(t("interviewSaved"));
        onOpenChange(false);
      })
      .catch(handleError);
  }

  return (
    <EntryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("logInterview")}
      saveLabel={t("saveInterview")}
      onSave={save}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <FieldLabel>{t("date")}</FieldLabel>
          <Input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
          />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>{t("interviewer")}</FieldLabel>
          <Input
            value={interviewer}
            onChange={e => setInterviewer(e.target.value)}
            placeholder={t("interviewerPlaceholder")}
          />
        </label>
      </div>
      <label className="space-y-1.5">
        <FieldLabel>{t("note")}</FieldLabel>
        <Textarea
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder={t("interviewNotePlaceholder")}
        />
      </label>
    </EntryDialogShell>
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

function TerminForm({
  open,
  onOpenChange,
  applicants = [],
  fixedApplicantId,
}: TerminDialogProps) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const createTermin = useMutation(api.applicants.createTermin);
  const handleError = useErrorHandler();

  const [applicantId, setApplicantId] = useState<string>(
    fixedApplicantId ?? ""
  );
  const [datum, setDatum] = useState(today());
  const [uhrzeit, setUhrzeit] = useState("10:00");
  const [art, setArt] = useState<(typeof TERMIN_ARTEN)[number]>("telefon");
  const [typ, setTypRaw] = useState<(typeof TERMIN_TYPEN)[number]>("interview");
  const [notiz, setNotiz] = useState("");

  function setTyp(next: (typeof TERMIN_TYPEN)[number]) {
    setTypRaw(next);
    if (next === "wiedervorlage") setDatum(addWorkdays(3));
  }

  function save() {
    if (!applicantId) {
      toast.error(t("selectApplicantFirst"));
      return;
    }
    createTermin({
      applicantId: applicantId as Id<"applicants">,
      datum,
      uhrzeit,
      art,
      typ,
      notiz: notiz.trim() || undefined,
    })
      .then(() => {
        toast.success(t("terminSaved"));
        onOpenChange(false);
      })
      .catch(handleError);
  }

  return (
    <EntryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("planTermin")}
      description={t("calendarDescription")}
      tip={
        typ === "wiedervorlage"
          ? t("wiedervorlageHint", { date: formatIsoDate(datum, locale) })
          : undefined
      }
      saveLabel={t("saveTermin")}
      saveDisabled={!applicantId}
      onSave={save}
    >
      {!fixedApplicantId && (
        <div className="space-y-1.5">
          <FieldLabel>{t("applicant")}</FieldLabel>
          <Select value={applicantId} onValueChange={setApplicantId}>
            <SelectTrigger>
              <SelectValue placeholder={t("chooseApplicant")} />
            </SelectTrigger>
            <SelectContent>
              {applicants.map(a => (
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
          <Input
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
          />
        </label>
        <label className="space-y-1.5">
          <FieldLabel>{t("time")}</FieldLabel>
          <Input
            type="time"
            value={uhrzeit}
            onChange={e => setUhrzeit(e.target.value)}
          />
        </label>
        <div className="space-y-1.5">
          <FieldLabel>{t("terminArtLabel")}</FieldLabel>
          <Select value={art} onValueChange={v => setArt(v as typeof art)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMIN_ARTEN.map(a => (
                <SelectItem key={a} value={a}>
                  {t(`terminArt.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <FieldLabel>{t("terminTypLabel")}</FieldLabel>
          <Select value={typ} onValueChange={v => setTyp(v as typeof typ)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TERMIN_TYPEN.map(ty => (
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
          onChange={e => setNotiz(e.target.value)}
        />
      </label>
    </EntryDialogShell>
  );
}

export function TerminDialog(props: TerminDialogProps) {
  if (!props.open) return null;
  return <TerminForm {...props} />;
}
