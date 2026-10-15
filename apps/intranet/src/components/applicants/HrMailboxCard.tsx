"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Inbox, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

type ImportStatus = "started" | "no_pdf" | "too_large" | "failed";

const STATUS_VARIANT: Record<ImportStatus, "success" | "warning" | "destructive"> = {
  started: "success",
  no_pdf: "warning",
  too_large: "warning",
  failed: "destructive",
};

/**
 * The shared application inbox (bewerbung@): set it up, see whether it
 * works, and what the last imports did. Each new mail with a PDF becomes a
 * CV import in the tray of the person who set the mailbox up.
 */
export function HrMailboxCard() {
  const t = useTranslations("Applicants");
  const locale = useLocale();
  const data = useQuery(api.hr.mailbox.status);
  const remove = useMutation(api.hr.mailbox.remove);
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const [editing, setEditing] = useState(false);

  if (data === undefined) return null;
  const { mailbox, imports } = data;

  async function onRemove() {
    const ok = await confirm({
      title: t("mailboxRemoveTitle"),
      description: t("mailboxRemoveDescription"),
      confirmLabel: t("mailboxRemove"),
    });
    if (!ok) return;
    remove({})
      .then(() => toast.success(t("mailboxRemoved")))
      .catch(handleError);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Inbox className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">{t("mailboxTitle")}</p>
              <InfoTip text={t("mailboxDescription")} />
            </div>
            {mailbox ? (
              <p className="mt-1 text-sm">
                <span className="font-medium">{mailbox.email}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {t("mailboxImportsAs", { name: mailbox.setByName })}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t("mailboxNone")}</p>
            )}
            {mailbox && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mailbox.error === "auth"
                  ? t("mailboxErrorAuth")
                  : mailbox.error === "connect"
                    ? t("mailboxErrorConnect")
                    : mailbox.checkedAt
                      ? t("mailboxCheckedAt", { time: formatDateTime(mailbox.checkedAt, locale) })
                      : null}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {mailbox ? t("mailboxChange") : t("mailboxSetUp")}
            </Button>
            {mailbox && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("mailboxRemove")}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => void onRemove()}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {imports.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">{t("mailboxLog")}</p>
            <ul className="space-y-1">
              {imports.map((row) => (
                <li key={row._id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{row.subject || t("mailboxNoSubject")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.from} · {formatDateTime(row.receivedAt ?? row.at, locale)}
                      {row.fileName ? ` · ${row.fileName}` : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.status]} className="shrink-0">
                    {t(`mailboxStatus_${row.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      {editing && (
        <MailboxDialog initialEmail={mailbox?.email ?? ""} onClose={() => setEditing(false)} />
      )}
    </Card>
  );
}

function MailboxDialog({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const t = useTranslations("Applicants");
  const client = useIntranetApiClient();
  const [email, setEmail] = useState(initialEmail || "bewerbung@advantisgroup.de");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await client.fetchJson("/hr/mailbox", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      toast.success(t("mailboxSaved"));
      onClose();
    } catch (err) {
      if (err instanceof ApiResponseError && err.code === "bad_request") {
        setError(t("mailboxRejected"));
      } else {
        const cause =
          err instanceof ApiResponseError
            ? [err.serverMessage ?? err.code, err.requestId && `ID ${err.requestId}`]
                .filter(Boolean)
                .join(" · ")
            : err instanceof Error
              ? err.message
              : String(err);
        setError(`${t("mailboxFailed")}: ${cause}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("mailboxDialogTitle")}
      description={t("mailboxDialogHint")}
      footer={
        <Button onClick={() => void save()} disabled={saving || !email || !password}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("mailboxSave")}
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (email && password) void save();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="hr-mailbox-email">{t("mailboxEmail")}</Label>
          <Input
            id="hr-mailbox-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hr-mailbox-password">{t("mailboxPassword")}</Label>
          <Input
            id="hr-mailbox-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </ResponsiveDialog>
  );
}
