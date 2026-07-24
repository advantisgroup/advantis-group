"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { clearPerformanceToken } from "@/lib/performanceAuth";

// Every gate check in performanceAuth.ts corresponds to one of these keys —
// this is the fixed part (packages/convex/convex/performance/lib/permissions.ts);
// which of them a given role grants is the customizable part.
const PERMISSIONS = [
  "view_own_dashboard",
  "view_all_employees",
  "upload_reports",
  "manage_roster",
  "manage_logins",
  "manage_roles",
  "export_data",
  "view_flagged_rows",
  "resolve_flagged_rows",
] as const;

interface RoleRow {
  id: Id<"companyRoles">;
  name: string;
  permissions: string[];
  isBuiltIn: boolean;
}

function RoleDialog({
  open,
  onOpenChange,
  token,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  role: RoleRow | null;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const createRole = useMutation(api.companyRoles.create);
  const updateRole = useMutation(api.companyRoles.update);
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(role?.permissions ?? [])
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name ?? "");
      setPermissions(new Set(role?.permissions ?? []));
    }
  }, [open, role]);

  function togglePermission(p: string) {
    setPermissions(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (role) {
        await updateRole({
          token,
          roleId: role.id,
          name: name.trim(),
          permissions: [...permissions],
        });
      } else {
        await createRole({
          token,
          name: name.trim(),
          permissions: [...permissions],
        });
      }
      onOpenChange(false);
      toast.success(t("userUpdatedToast"));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {role ? t("roleEditTitle") : t("roleNewTitle")}
          </DialogTitle>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("roleNameLabel")}
            </label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            {PERMISSIONS.map(p => (
              <label
                key={p}
                className="flex items-center gap-2 rounded-md border border-transparent px-1 py-1 text-sm hover:border-border/60"
              >
                <Checkbox
                  checked={permissions.has(p)}
                  onCheckedChange={() => togglePermission(p)}
                />
                {t(`permission_${p}`)}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {t("roleSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PerformanceRolesAdminPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { token, session } = usePerformanceSession();
  const handleError = useErrorHandler();
  const removeRole = useMutation(api.companyRoles.remove);
  const [editing, setEditing] = useState<RoleRow | null | "new">(null);

  useEffect(() => {
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
      return;
    }
    // Cross-company role management from this page isn't built yet — a
    // super-admin manages roles per company from the intranet directly
    // against a chosen companyId; this page covers the common case (a
    // company's own admin managing their own roles).
    if (session.isSuperAdmin || !session.permissions.includes("manage_roles")) {
      router.replace("/performance");
    }
  }, [session, router]);

  const canManage =
    session?.valid &&
    !session.isSuperAdmin &&
    session.permissions.includes("manage_roles");
  const roles = useQuery(api.companyRoles.list, canManage ? { token } : "skip");

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  async function handleDelete(roleId: Id<"companyRoles">) {
    try {
      await removeRole({ token, roleId });
      toast.success(t("userUpdatedToast"));
    } catch (err) {
      handleError(err);
    }
  }

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid || !canManage) return null;

  const navItems = [{ href: "/performance", label: t("backToDashboard") }];

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader
        navItems={navItems}
        onExit={session.viaClerk ? undefined : exit}
      />
      <main className="mx-auto max-w-3xl space-y-6 p-4 pb-24 md:p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                {t("rolesTitle")}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("rolesIntro")}
              </p>
            </div>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="mr-2 h-4 w-4" />
              {t("roleNew")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles === undefined ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("rolesEmpty")}</p>
            ) : (
              roles.map(role => (
                <div
                  key={role.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {role.name}
                      {role.isBuiltIn && (
                        <Badge variant="muted" className="text-[10px]">
                          {t("roleBuiltInBadge")}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {role.permissions.length} / {PERMISSIONS.length}{" "}
                      {t("rolesTitle")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditing(role)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!role.isBuiltIn && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void handleDelete(role.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
      <RoleDialog
        open={editing !== null}
        onOpenChange={o => {
          if (!o) setEditing(null);
        }}
        token={token}
        role={editing === "new" || editing === null ? null : editing}
      />
      <PerformanceBottomTabs
        navItems={navItems}
        onExit={session.viaClerk ? undefined : exit}
      />
    </div>
  );
}
