"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { type ApplicantDetail } from "@/components/applicants/applicant-types";
import {
  EMAIL_KATEGORIEN,
  type EmailKategorie,
  fillTemplate,
  nextOpenTermin,
  openPlaceholders,
} from "@/components/applicants/email-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";

function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

/**
 * Send a mail to the applicant from the HR mailbox: pick a template, its
 * placeholders are filled from the applicant and their next appointment,
 * the text can still be changed, then it goes out and lands in the history.
 */
export function SendEmailDialog({
  applicant,
  open,
  onOpenChange,
}: {
  applicant: ApplicantDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Applicants");
  const client = useIntranetApiClient();
  const templates = useQuery(api.hr.emails.listTemplates, open ? {} : "skip");
  const mailbox = useQuery(api.hr.mailbox.status, open ? {} : "skip");
  const [templateId, setTemplateId] = useState("");
  const [kategorie, setKategorie] = useState<EmailKategorie>("sonstiges");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const termin = nextOpenTermin(applicant, todayIso());
  const fill = (text: string) =>
    fillTemplate(text, applicant, termin, (art) => t(`terminArt.${art}`));

  function pickTemplate(id: string) {
    setTemplateId(id);
    const template = templates?.find((row) => row._id === id);
    if (!template) return;
    setKategorie(template.kategorie);
    setSubject(fill(template.subject));
    setBody(fill(template.body));
  }

  function close() {
    setTemplateId("");
    setSubject("");
    setBody("");
    setKategorie("sonstiges");
    setError(null);
    onOpenChange(false);
  }

  const unfilled = [...openPlaceholders(subject), ...openPlaceholders(body)];
  const noAddress = !applicant.email?.trim();
  const noMailbox = mailbox !== undefined && !mailbox.mailbox;
  const blocked = noAddress || noMailbox;

  async function send() {
    setSending(true);
    setError(null);
    try {
      await client.fetchJson(`/hr/applicants/${applicant._id}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kategorie, subject, text: body }),
      });
      toast.success(t("sendEmailSent", { email: applicant.email ?? "" }));
      close();
    } catch (err) {
      setError(
        err instanceof ApiResponseError
          ? (err.serverMessage ?? t("sendEmailFailed"))
          : t("sendEmailFailed"),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t("sendEmailTitle")}
      description={
        noAddress
          ? t("sendEmailNoAddress")
          : t("sendEmailTo", {
              email: applicant.email ?? "",
              from: mailbox?.mailbox?.email ?? "bewerbung@",
            })
      }
      footer={
        <Button
          onClick={() => void send()}
          disabled={sending || blocked || !subject.trim() || !body.trim() || unfilled.length > 0}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {t("sendEmailSend")}
        </Button>
      }
    >
      <div className="space-y-4">
        {noMailbox && (
          <p className="rounded-md bg-muted p-3 text-sm">
            {t("sendEmailNoMailbox")}{" "}
            <Link href="/hr/access" className="underline">
              {t("sendEmailNoMailboxLink")}
            </Link>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("sendEmailTemplate")}</Label>
            <Select value={templateId} onValueChange={pickTemplate}>
              <SelectTrigger>
                <SelectValue placeholder={t("sendEmailChooseTemplate")} />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((row) => (
                  <SelectItem key={row._id} value={row._id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("sendEmailNoTemplates")}{" "}
                <Link href="/hr/vorlagen" className="underline">
                  {t("tabTemplates")}
                </Link>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{t("templateKategorie")}</Label>
            <Select value={kategorie} onValueChange={(v) => setKategorie(v as EmailKategorie)}>
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
        <div className="space-y-1.5">
          <Label htmlFor="send-subject">{t("templateSubject")}</Label>
          <Input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="send-body">{t("templateBody")}</Label>
          <Textarea
            id="send-body"
            rows={12}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {unfilled.length > 0 && (
          <p className="text-[12.5px] text-warn">
            {t("sendEmailOpenPlaceholders", { list: unfilled.join(", ") })}
          </p>
        )}
        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
