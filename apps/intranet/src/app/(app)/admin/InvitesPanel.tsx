"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useQuery } from "convex/react";
import { Mail, RotateCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime } from "@/lib/format";

/** True when `email`'s domain is outside the configured company domains. */
function isExternalEmail(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return false;
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return domain.length > 0 && !allowedDomains.includes(domain);
}

export function InvitesPanel({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const confirm = useConfirm();
  const invites = useQuery(api.invites.list, {});
  const config = useQuery(api.invites.config, {});
  // create/resend/revoke are Convex actions: they call Clerk's Backend API
  // directly and await it, so failures surface here as a rejected promise.
  const create = useAction(api.invites.create);
  const revoke = useAction(api.invites.revoke);
  const resend = useAction(api.invites.resend);
  const handleError = useErrorHandler();
  const allowedDomains = config?.allowedDomains ?? [];

  async function onRevoke(id: Id<"invites">) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ inviteId: id }).catch(handleError);
  }
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [busy, setBusy] = useState(false);

  async function send() {
    const trimmed = email.trim();
    if (!trimmed) return;

    // Emails outside the company domains are admin-only and need an explicit
    // confirmation before Clerk sends the invitation.
    if (isExternalEmail(trimmed, allowedDomains)) {
      if (!isAdmin) {
        toast.error(t("inviteExternalForbidden"));
        return;
      }
      const ok = await confirm({
        title: t("inviteExternalTitle"),
        description: t("inviteExternalBody", { email: trimmed }),
        confirmLabel: t("sendInvite"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      await create({ email: trimmed, role });
      toast.success(t("sendInvite"));
      setEmail("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const enteredExternal = isExternalEmail(email.trim(), allowedDomains);

  const pending = invites?.filter(i => i.status === "pending") ?? [];

  return (
    <div className="space-y-4">
      <Card nested>
        <CardContent className="flex flex-col gap-2 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <Input
              type="email"
              placeholder={t("inviteEmail")}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="sm:flex-1"
            />
            <div className="flex gap-2">
              <RoleSelect
                value={role}
                onChange={setRole}
                canElevate={isAdmin}
              />
              <Button
                onClick={send}
                disabled={
                  busy || !email.trim() || (enteredExternal && !isAdmin)
                }
                className="flex-1 sm:flex-none"
              >
                <Mail className="mr-2 h-4 w-4" />
                {t("sendInvite")}
              </Button>
            </div>
          </div>
          {enteredExternal && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {isAdmin ? t("inviteExternalHint") : t("inviteExternalForbidden")}
            </p>
          )}
        </CardContent>
      </Card>

      {pending.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("noInvites")}
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map(i => (
            <Card nested key={i._id}>
              <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("invitedBy", { name: i.invitedByName })} ·{" "}
                      {formatDateTime(i.createdAt, locale)}
                    </p>
                  </div>
                  {i.external && (
                    <Badge variant="warning" className="shrink-0">
                      {t("external")}
                    </Badge>
                  )}
                  <Badge variant="muted" className="shrink-0">
                    {i.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 sm:flex-none"
                    onClick={() =>
                      resend({ inviteId: i._id })
                        .then(() => toast.success(t("resend")))
                        .catch(handleError)
                    }
                  >
                    <RotateCw className="mr-1 h-3.5 w-3.5" />
                    {t("resend")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 sm:flex-none"
                    onClick={() => void onRevoke(i._id)}
                  >
                    {t("revoke")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
