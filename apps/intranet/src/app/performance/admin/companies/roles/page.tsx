"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";

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

// A flat 9-item checkbox list read as an undifferentiated wall — grouped
// here into "view" (never changes anything) vs. "manage" (creates/edits/
// deletes) purely for how the edit dialog renders them; storage
// (`companyRoles.permissions`) stays an unordered flat array either way,
// so this has no effect outside this one form.
const PERMISSION_GROUPS: {
  key: "read" | "write";
  permissions: (typeof PERMISSIONS)[number][];
}[] = [
  {
    key: "read",
    permissions: [
      "view_own_dashboard",
      "view_all_employees",
      "view_flagged_rows",
      "export_data",
    ],
  },
  {
    key: "write",
    permissions: [
      "upload_reports",
      "manage_roster",
      "manage_logins",
      "manage_roles",
      "resolve_flagged_rows",
    ],
  },
];

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
  companyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  role: RoleRow | null;
  /** The company a new role is created under — only meaningful for a
   * super-admin, who has no `companyId` of their own to fall back to
   * server-side (see `companyRoles.resolveTargetCompanyId`). Ignored when
   * editing an existing role, which already belongs to a company. */
  companyId: Id<"companies"> | null;
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
          companyId: companyId ?? undefined,
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
          <div className="space-y-4">
            {PERMISSION_GROUPS.map(group => (
              <div key={group.key} className="space-y-1">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`permissionGroup_${group.key}`)}
                </p>
                {group.permissions.map(p => (
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
            ))}
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
          >
            {t("roleSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PerformanceRolesAdminPage() {
  const t = useTranslations("Performance");
  const { token, session } = usePerformanceSession();
  const handleError = useErrorHandler();
  const removeRole = useMutation(api.companyRoles.remove);
  const [editing, setEditing] = useState<RoleRow | null | "new">(null);
  // Only meaningful for a super-admin, who has no company of their own —
  // a scoped company admin's own companyId is resolved server-side and
  // never needs picking.
  const [companyId, setCompanyId] = useState<Id<"companies"> | null>(null);

  // Gated on isSuperAdmin-or-manage_roles by the parent layout — always
  // true by the time this page is mounted.
  const isSuperAdmin = session?.valid && session.isSuperAdmin;

  // A super-admin has no companyId of their own (`companyRoles.list`
  // requires one explicitly in that case) — everyone else's own company is
  // resolved server-side from their session, so no company arg is passed.
  const companies = useQuery(
    api.companies.listCompanies,
    isSuperAdmin ? { token } : "skip"
  );
  const roles = useQuery(
    api.companyRoles.list,
    isSuperAdmin ? (companyId ? { token, companyId } : "skip") : { token }
  );

  async function handleDelete(roleId: Id<"companyRoles">) {
    try {
      await removeRole({ token, roleId });
      toast.success(t("userUpdatedToast"));
    } catch (err) {
      handleError(err);
    }
  }

  const canCreate = !isSuperAdmin || !!companyId;

  return (
    <>
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
            <Button
              size="sm"
              onClick={() => setEditing("new")}
              disabled={!canCreate}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("roleNew")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isSuperAdmin && (
              <Select
                value={companyId ?? undefined}
                onValueChange={v => setCompanyId(v as Id<"companies">)}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder={t("rolesCompanyPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isSuperAdmin && !companyId ? (
              <p className="text-sm text-muted-foreground">
                {t("rolesCompanyEmpty")}
              </p>
            ) : roles === undefined ? (
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
        companyId={companyId}
      />
    </>
  );
}
