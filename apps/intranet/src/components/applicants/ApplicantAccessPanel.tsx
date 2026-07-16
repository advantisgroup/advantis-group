"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { KeyRound, ShieldCheck, UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InfoTip } from "@/components/activity/InfoTip";
import { VaultStepUpDialog } from "@/components/applicants/VaultStepUpDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";

export function ApplicantAccessPanel() {
  const t = useTranslations("Applicants");
  const tRoles = useTranslations("Roles");
  const eligible = useQuery(api.users.eligibleForApplicantAccess);
  const passwordStatuses = useQuery(api.applicantVault.memberPasswordStatuses);
  const setAccess = useMutation(api.users.setApplicantAccess);
  const resetPassword = useMutation(api.applicantVault.resetPassword);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const [pickerId, setPickerId] = useState("");
  const [stepUpAction, setStepUpAction] = useState<(() => void) | null>(null);

  const granted = (eligible ?? []).filter(u => u.applicantAccess);
  const grantable = (eligible ?? []).filter(u => !u.applicantAccess);
  const passwordIsSetByUser = new Map(
    (passwordStatuses ?? []).map(s => [s.userId, s.passwordIsSet])
  );

  function doGrant(userId: Id<"users">, name: string) {
    setAccess({ userId, access: true })
      .then(() => {
        toast.success(t("accessGranted", { name }));
        setPickerId("");
      })
      .catch(handleError);
  }

  function doRevoke(userId: Id<"users">, name: string) {
    setAccess({ userId, access: false })
      .then(() => toast.success(t("accessRevoked", { name })))
      .catch(handleError);
  }

  function doResetPassword(userId: Id<"users">, name: string) {
    resetPassword({ userId })
      .then(() => toast.success(t("resetPasswordSuccess", { name })))
      .catch(handleError);
  }

  async function grant(userId: Id<"users">, name: string) {
    const ok = await confirm({
      title: t("grantAccessTitle"),
      description: t("grantAccessDescription", { name }),
      items: [
        { tone: "positive", text: t("grantAccessItem1") },
        { tone: "positive", text: t("grantAccessItem2") },
      ],
      confirmText: { target: name },
      confirmLabel: t("grantAccessConfirm"),
      destructive: false,
    });
    if (!ok) return;
    setStepUpAction(() => () => doGrant(userId, name));
  }

  async function revoke(userId: Id<"users">, name: string) {
    const ok = await confirm({
      title: t("revokeAccessTitle"),
      description: t("revokeAccessDescription", { name }),
      items: [
        { tone: "negative", text: t("revokeAccessItem1") },
        { tone: "neutral", text: t("revokeAccessItem2") },
      ],
      confirmText: { target: name },
      confirmLabel: t("revokeAccessConfirm"),
    });
    if (!ok) return;
    setStepUpAction(() => () => doRevoke(userId, name));
  }

  async function resetPasswordFor(userId: Id<"users">, name: string) {
    const ok = await confirm({
      title: t("resetPasswordTitle", { name }),
      description: t("resetPasswordDescription", { name }),
      confirmLabel: t("resetPasswordConfirm"),
    });
    if (!ok) return;
    setStepUpAction(() => () => doResetPassword(userId, name));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">{t("grantAccess")}</p>
            <InfoTip text={t("accessDescription")} />
          </div>
          {grantable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noEligibleUsers")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Select value={pickerId} onValueChange={setPickerId}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue placeholder={t("chooseUser")} />
                </SelectTrigger>
                <SelectContent>
                  {grantable.map(u => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!pickerId}
                aria-label={t("grantAccessConfirm")}
                onClick={() => {
                  const user = grantable.find(u => u._id === pickerId);
                  if (user) void grant(user._id, user.name);
                }}
              >
                <ShieldCheck className="size-4" />
                <span className="hidden md:inline">
                  {t("grantAccessConfirm")}
                </span>
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("eligibilityHint")}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-semibold">
          {t("currentAccess")} ({granted.length})
        </p>
        {granted.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOneHasAccess")}</p>
        ) : (
          granted.map(u => (
            <Card nested key={u._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="muted">{tRoles(u.role)}</Badge>
                  <Badge
                    variant={
                      passwordIsSetByUser.get(u._id) ? "muted" : "outline"
                    }
                  >
                    {passwordIsSetByUser.get(u._id)
                      ? t("resetPasswordSet")
                      : t("resetPasswordNotSet")}
                  </Badge>
                  {passwordIsSetByUser.get(u._id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("resetPasswordConfirm")}
                      onClick={() => void resetPasswordFor(u._id, u.name)}
                    >
                      <KeyRound className="size-4" />
                      <span className="hidden md:inline">
                        {t("resetPassword")}
                      </span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t("revokeAccessConfirm")}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void revoke(u._id, u.name)}
                  >
                    <UserMinus className="size-4" />
                    <span className="hidden md:inline">
                      {t("revokeAccessConfirm")}
                    </span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <VaultStepUpDialog
        open={!!stepUpAction}
        onOpenChange={o => !o && setStepUpAction(null)}
        onVerified={() => {
          stepUpAction?.();
          setStepUpAction(null);
        }}
      />
    </div>
  );
}
