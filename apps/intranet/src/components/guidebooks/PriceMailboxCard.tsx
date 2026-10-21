"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Mail, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

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

/** „2026-10-21“ → „21.10.2026“. */
function formatStand(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Nur für Admins: das Postfach, aus dem der Eintrag „Listenpreise netto“
 * jeden Morgen automatisch aktualisiert wird (wiki/priceMailbox.ts).
 */
export function PriceMailboxCard() {
  const t = useTranslations("Guidebooks");
  const locale = useLocale();
  const mailbox = useQuery(api.wiki.priceMailbox.status);
  const remove = useMutation(api.wiki.priceMailbox.remove);
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const [editing, setEditing] = useState(false);

  if (mailbox === undefined) return null;

  async function onRemove() {
    const ok = await confirm({
      title: t("priceMailboxRemoveTitle"),
      description: t("priceMailboxRemoveDescription"),
      confirmLabel: t("priceMailboxRemove"),
    });
    if (!ok) return;
    remove({})
      .then(() => toast.success(t("priceMailboxRemoved")))
      .catch(handleError);
  }

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Mail className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold">{t("priceMailboxTitle")}</p>
            <InfoTip text={t("priceMailboxDescription")} />
          </div>
          {mailbox ? (
            <>
              <p className="mt-1 text-sm font-medium">{mailbox.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mailbox.error === "auth"
                  ? t("priceMailboxErrorAuth")
                  : mailbox.error === "connect"
                    ? t("priceMailboxErrorConnect")
                    : mailbox.checkedAt
                      ? t("priceMailboxCheckedAt", {
                          time: formatDateTime(mailbox.checkedAt, locale),
                        })
                      : null}
                {" · "}
                {mailbox.lastStand && mailbox.lastImportAt
                  ? t("priceMailboxLastImport", {
                      stand: formatStand(mailbox.lastStand),
                      time: formatDateTime(mailbox.lastImportAt, locale),
                    })
                  : t("priceMailboxNoImport")}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("priceMailboxNone")}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {mailbox ? t("priceMailboxChange") : t("priceMailboxSetUp")}
          </Button>
          {mailbox && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("priceMailboxRemove")}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void onRemove()}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </CardContent>
      {editing && (
        <PriceMailboxDialog initialEmail={mailbox?.email ?? ""} onClose={() => setEditing(false)} />
      )}
    </Card>
  );
}

function PriceMailboxDialog({
  initialEmail,
  onClose,
}: {
  initialEmail: string;
  onClose: () => void;
}) {
  const t = useTranslations("Guidebooks");
  const client = useIntranetApiClient();
  const [email, setEmail] = useState(initialEmail || "chefsache@advantisgroup.de");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await client.fetchJson("/price-mailbox", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      toast.success(t("priceMailboxSaved"));
      onClose();
    } catch (err) {
      if (err instanceof ApiResponseError && err.code === "bad_request") {
        setError(t("priceMailboxRejected"));
      } else {
        const cause =
          err instanceof ApiResponseError
            ? [err.serverMessage ?? err.code, err.requestId && `ID ${err.requestId}`]
                .filter(Boolean)
                .join(" · ")
            : err instanceof Error
              ? err.message
              : String(err);
        setError(`${t("priceMailboxFailed")}: ${cause}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("priceMailboxDialogTitle")}
      description={t("priceMailboxDialogHint")}
      footer={
        <Button onClick={() => void save()} disabled={saving || !email || !password}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("priceMailboxSave")}
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
          <Label htmlFor="price-mailbox-email">{t("priceMailboxEmail")}</Label>
          <Input
            id="price-mailbox-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price-mailbox-password">{t("priceMailboxPassword")}</Label>
          <Input
            id="price-mailbox-password"
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
