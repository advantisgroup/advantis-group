"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useMutation, useQuery } from "convex/react";
import { Ellipsis, Mail, RotateCw, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { PageHeaderActions } from "@/components/layout/PageHeaderBar";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
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
  const tRoles = useTranslations("Roles");
  const locale = useLocale();
  const confirm = useConfirm();
  const invites = useQuery(api.people.invites.list, {});
  const config = useQuery(api.people.invites.config, {});
  // create/resend/revoke are Convex actions: they call Clerk's Backend API
  // directly and await it, so failures surface here as a rejected promise.
  const create = useAction(api.people.invites.create);
  const revoke = useMutation(api.people.invites.revoke);
  const resend = useAction(api.people.invites.resend);
  const handleError = useErrorHandler();
  const allowedDomains = config?.allowedDomains ?? [];

  async function onRevoke(invite: { _id: Id<"invites">; email: string; role: Role }) {
    const ok = await confirm({
      title: t("revoke"),
      description: tc("deleteWarning"),
      details: [
        { label: t("inviteEmail"), value: invite.email },
        { label: t("role"), value: invite.role },
      ],
      confirmLabel: t("revoke"),
      cancelLabel: tc("cancel"),
    });
    if (ok) revoke({ inviteId: invite._id }).catch(handleError);
  }

  function onResend(inviteId: Id<"invites">) {
    resend({ inviteId })
      .then(() => toast.success(t("resend")))
      .catch(handleError);
  }

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [busy, setBusy] = useState(false);

  async function send() {
    const trimmed = email.trim();
    if (!trimmed) return;

    // Emails outside the company domains need an explicit confirmation
    // before Clerk sends the invitation — a personal address works just as
    // well as a company one, this is just a heads-up, not a restriction.
    if (isExternalEmail(trimmed, allowedDomains)) {
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
      setInviteOpen(false);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  const enteredExternal = isExternalEmail(email.trim(), allowedDomains);

  const pending = invites?.filter((i) => i.status === "pending") ?? [];

  return (
    <div className="space-y-4">
      <PageHeaderActions
        actions={[
          { key: "invite", label: t("sendInvite"), icon: Mail, onClick: () => setInviteOpen(true) },
        ]}
      />
      <ResponsiveDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={t("sendInvite")}
        footer={
          <Button onClick={send} disabled={busy || !email.trim()} className="w-full sm:w-auto">
            <Mail className="mr-2 h-4 w-4" />
            {t("sendInvite")}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <Input
            type="email"
            placeholder={t("inviteEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <RoleSelect value={role} onChange={setRole} canElevate={isAdmin} />
        </div>
        {enteredExternal && <p className="mt-2 text-xs text-warn">{t("inviteExternalHint")}</p>}
      </ResponsiveDialog>
      {pending.length === 0 ? (
        <EmptyState icon={<Mail />} title={t("noInvites")} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("pendingInvites", { count: pending.length })}
          </p>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            {pending.map((i) => (
              <li key={i._id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Mail className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{i.email}</span>
                    {i.external && (
                      <span className="shrink-0 rounded-full bg-warn/12 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                        {t("external")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tRoles(i.role)} · {t("invitedBy", { name: i.invitedByName })} ·{" "}
                    {formatDateTime(i.createdAt, locale)}
                  </p>
                </div>
                <ActionMenu
                  ariaLabel={i.email}
                  trigger={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      aria-label={i.email}
                    >
                      <Ellipsis />
                    </Button>
                  }
                  items={[
                    {
                      key: "resend",
                      label: t("resend"),
                      icon: <RotateCw />,
                      onSelect: () => onResend(i._id),
                    },
                    {
                      key: "revoke",
                      label: t("revoke"),
                      icon: <XCircle />,
                      destructive: true,
                      onSelect: () => void onRevoke(i),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
