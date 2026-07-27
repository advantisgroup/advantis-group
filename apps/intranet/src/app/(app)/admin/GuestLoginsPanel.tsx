"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Copy, KeyRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

export function GuestLoginsPanel() {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const logins = useQuery(api.guest.listTempLogins, {});
  const create = useMutation(api.guest.createTempLogin);
  const revoke = useMutation(api.guest.revokeTempLogin);
  const handleError = useErrorHandler();

  async function onRevoke(id: Id<"tempLogins">) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ id }).catch(handleError);
  }
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState("48");
  const [busy, setBusy] = useState(false);

  async function make() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await create({
        label: label.trim(),
        email: email.trim() || undefined,
        hours: Number(hours) || 48,
      });
      toast.success(t("createGuest"));
      setLabel("");
      setEmail("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    void navigator.clipboard.writeText(`${origin}/guest/login?token=${token}`);
    toast.success(t("copied"));
  }

  const statusVariant = (s: string) =>
    s === "active" ? "success" : s === "expired" ? "warning" : "muted";

  return (
    <div className="space-y-4">
      <Card nested>
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <Input
            placeholder={t("guestLabel")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="sm:flex-1"
          />
          <Input
            type="email"
            placeholder={t("guestEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sm:w-48"
          />
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-20 shrink-0"
              aria-label={t("guestHours")}
            />
            <Button onClick={make} disabled={busy || !label.trim()} className="flex-1 sm:flex-none">
              <KeyRound className="mr-2 h-4 w-4" />
              {t("createGuest")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {logins && logins.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noGuests")}</p>
      ) : (
        <div className="space-y-2">
          {logins?.map((g) => (
            <Card nested key={g._id}>
              <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.email ?? "—"} · {t("expires")} {formatDateTime(g.expiresAt, locale)}
                    </p>
                  </div>
                  <Badge variant={statusVariant(g.status)} className="shrink-0">
                    {g.status === "active"
                      ? t("active")
                      : g.status === "expired"
                        ? t("expired")
                        : t("revoked")}
                  </Badge>
                </div>
                {g.status === "active" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => copyLink(g.token)}
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {t("copyLink")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => void onRevoke(g._id)}
                    >
                      {t("revoke")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
