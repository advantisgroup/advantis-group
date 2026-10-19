"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Doc } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  EMAIL_KATEGORIEN,
  KONTAKT_ARTEN,
  TERMIN_ARTEN,
  TERMIN_TYPEN,
} from "@/components/applicants/applicant-types";
import { TerminDayPreview } from "@/components/applicants/TerminDayPreview";
import { FieldLabel, FormDialog } from "@/components/compose/FormDialog";
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

/** Any entry of an Akte that the pencil can open. */
export type EditableEntry =
  | { kind: "termin"; entry: Doc<"applicantAppointments">; applicantName?: string | null }
  | { kind: "kontakt"; entry: Doc<"applicantContacts"> }
  | { kind: "email"; entry: Doc<"applicantEmails"> }
  | { kind: "interview"; entry: Doc<"applicantInterviews"> };

interface FormProps<T extends EditableEntry["kind"]> {
  target: Extract<EditableEntry, { kind: T }>;
  onClose: () => void;
}

/**
 * Edit a Termin or a Verlauf entry after it was logged. No drafts here:
 * the entry itself is the saved state, and "Abbrechen" leaves it as it was.
 */
export function EditEntryDialog({
  target,
  onClose,
}: {
  target: EditableEntry | null;
  onClose: () => void;
}) {
  if (!target) return null;
  switch (target.kind) {
    case "termin":
      return <TerminEdit target={target} onClose={onClose} />;
    case "kontakt":
      return <KontaktEdit target={target} onClose={onClose} />;
    case "email":
      return <EmailEdit target={target} onClose={onClose} />;
    case "interview":
      return <InterviewEdit target={target} onClose={onClose} />;
  }
}

function useSave(onClose: () => void) {
  const t = useTranslations("Applicants");
  const handleError = useErrorHandler();
  const [busy, setBusy] = useState(false);
  async function run(write: () => Promise<unknown>) {
    setBusy(true);
    try {
      await write();
      toast.success(t("entryUpdated"));
      onClose();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function DateField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Applicants");
  return (
    <label className="space-y-1.5">
      <FieldLabel>{t("date")}</FieldLabel>
      <Input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NoteField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations("Applicants");
  return (
    <label className="space-y-1.5">
      <FieldLabel>{t("note")}</FieldLabel>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

/* ── Termin ──────────────────────────────────────────────────────────────── */

function TerminEdit({ target, onClose }: FormProps<"termin">) {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const update = useMutation(api.hr.applicants.updateTermin);
  const { busy, run } = useSave(onClose);
  const original = target.entry;
  const [datum, setDatum] = useState(original.datum);
  const [uhrzeit, setUhrzeit] = useState(original.uhrzeit);
  const [art, setArt] = useState(original.art);
  const [typ, setTyp] = useState(original.typ);
  const [notiz, setNotiz] = useState(original.notiz ?? "");

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("editTermin")}
      description={[
        target.applicantName,
        t("originalSlot", {
          slot: `${formatIsoDate(original.datum, locale)}${original.uhrzeit ? `, ${original.uhrzeit}` : ""}`,
        }),
      ]
        .filter(Boolean)
        .join(" · ")}
      contentClassName="max-w-3xl"
      checks={[
        { key: "date", label: t("date"), done: !!datum },
        { key: "time", label: t("time"), done: !!uhrzeit },
      ]}
      submitLabel={t("saveChanges")}
      busy={busy}
      onSubmit={() =>
        void run(() =>
          update({
            terminId: original._id,
            datum,
            uhrzeit,
            art,
            typ,
            notiz: notiz.trim() || undefined,
          }),
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <TerminFields
            datum={datum}
            setDatum={setDatum}
            uhrzeit={uhrzeit}
            setUhrzeit={setUhrzeit}
            art={art}
            setArt={setArt}
            typ={typ}
            setTyp={setTyp}
          />
          <NoteField value={notiz} onChange={setNotiz} placeholder={t("terminNotePlaceholder")} />
        </div>
        <TerminDayPreview
          datum={datum}
          uhrzeit={uhrzeit}
          art={art}
          newLabel={target.applicantName ?? t("previewThisTermin")}
          excludeTerminId={original._id}
          onPickDay={setDatum}
        />
      </div>
    </FormDialog>
  );
}

/** Date, time, channel and kind of a Termin — shared by planning and editing. */
export function TerminFields({
  datum,
  setDatum,
  uhrzeit,
  setUhrzeit,
  art,
  setArt,
  typ,
  setTyp,
}: {
  datum: string;
  setDatum: (v: string) => void;
  uhrzeit: string;
  setUhrzeit: (v: string) => void;
  art: (typeof TERMIN_ARTEN)[number];
  setArt: (v: (typeof TERMIN_ARTEN)[number]) => void;
  typ: (typeof TERMIN_TYPEN)[number];
  setTyp: (v: (typeof TERMIN_TYPEN)[number]) => void;
}) {
  const t = useTranslations("Applicants");
  return (
    <div className="grid grid-cols-2 gap-3">
      <DateField value={datum} onChange={setDatum} />
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
  );
}

/* ── Kontakt ─────────────────────────────────────────────────────────────── */

function KontaktEdit({ target, onClose }: FormProps<"kontakt">) {
  const t = useTranslations("Applicants");
  const update = useMutation(api.hr.applicants.updateKontakt);
  const { busy, run } = useSave(onClose);
  const original = target.entry;
  const [datum, setDatum] = useState(original.datum);
  const [art, setArt] = useState(original.art);
  const [notiz, setNotiz] = useState(original.notiz ?? "");

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("editKontakt")}
      checks={[{ key: "date", label: t("date"), done: !!datum }]}
      submitLabel={t("saveChanges")}
      busy={busy}
      onSubmit={() =>
        void run(() =>
          update({ kontaktId: original._id, datum, art, notiz: notiz.trim() || undefined }),
        )
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <DateField value={datum} onChange={setDatum} />
        <div className="space-y-1.5">
          <FieldLabel>{t("entryKind")}</FieldLabel>
          <Select value={art} onValueChange={(v) => setArt(v as typeof art)}>
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
      <NoteField value={notiz} onChange={setNotiz} placeholder={t("contactNotePlaceholder")} />
    </FormDialog>
  );
}

/* ── E-Mail ──────────────────────────────────────────────────────────────── */

function EmailEdit({ target, onClose }: FormProps<"email">) {
  const t = useTranslations("Applicants");
  const update = useMutation(api.hr.applicants.updateEmail);
  const { busy, run } = useSave(onClose);
  const original = target.entry;
  const sent = !!original.sentBy;
  const [datum, setDatum] = useState(original.datum);
  const [kategorie, setKategorie] = useState(original.kategorie);
  const [notiz, setNotiz] = useState(original.notiz ?? "");

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("editEmail")}
      description={original.subject}
      checks={[{ key: "date", label: t("date"), done: !!datum }]}
      submitLabel={t("saveChanges")}
      busy={busy}
      onSubmit={() =>
        void run(() =>
          update({ emailId: original._id, datum, kategorie, notiz: notiz.trim() || undefined }),
        )
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <DateField value={datum} onChange={setDatum} disabled={sent} />
        <div className="space-y-1.5">
          <FieldLabel>{t("entryKind")}</FieldLabel>
          <Select value={kategorie} onValueChange={(v) => setKategorie(v as typeof kategorie)}>
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
      <NoteField value={notiz} onChange={setNotiz} placeholder={t("emailNotePlaceholder")} />
      {sent && <DialogTip>{t("sentMailDateLocked")}</DialogTip>}
    </FormDialog>
  );
}

/* ── Interview ───────────────────────────────────────────────────────────── */

function InterviewEdit({ target, onClose }: FormProps<"interview">) {
  const t = useTranslations("Applicants");
  const update = useMutation(api.hr.applicants.updateInterview);
  const { busy, run } = useSave(onClose);
  const original = target.entry;
  const [datum, setDatum] = useState(original.datum);
  const [interviewer, setInterviewer] = useState(original.interviewer);
  const [notiz, setNotiz] = useState(original.notiz ?? "");

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("editInterview")}
      checks={[{ key: "date", label: t("date"), done: !!datum }]}
      submitLabel={t("saveChanges")}
      busy={busy}
      onSubmit={() =>
        void run(() =>
          update({
            interviewId: original._id,
            datum,
            interviewer,
            notiz: notiz.trim() || undefined,
          }),
        )
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <DateField value={datum} onChange={setDatum} />
        <label className="space-y-1.5">
          <FieldLabel>{t("interviewer")}</FieldLabel>
          <Input
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            placeholder={t("interviewerPlaceholder")}
          />
        </label>
      </div>
      <NoteField value={notiz} onChange={setNotiz} placeholder={t("interviewNotePlaceholder")} />
    </FormDialog>
  );
}
