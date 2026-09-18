"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { ActionMenu } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    permissions: ["view_own_dashboard", "view_all_employees", "view_flagged_rows", "export_data"],
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
  const createRole = useMutation(api.performance.roles.create);
  const updateRole = useMutation(api.performance.roles.update);
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name ?? "");
      setPermissions(new Set(role?.permissions ?? []));
    }
  }, [open, role]);

  function togglePermission(p: string) {
    setPermissions((prev) => {
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
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={role ? t("roleEditTitle") : t("roleNewTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {t("roleSave")}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("roleNameLabel")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-4">
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.key} className="space-y-1">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`permissionGroup_${group.key}`)}
            </p>
            {group.permissions.map((p) => (
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
    </ResponsiveDialog>
  );
}

export default function PerformanceRolesAdminPage() {
  const t = useTranslations("Performance");
  const { token, session } = usePerformanceSession();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const removeRole = useMutation(api.performance.roles.remove);
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
  const companies = useQuery(api.performance.companies.listCompanies, isSuperAdmin ? { token } : "skip");
  const roles = useQuery(
    api.performance.roles.list,
    isSuperAdmin ? (companyId ? { token, companyId } : "skip") : { token },
  );

  async function handleDelete(role: RoleRow) {
    const ok = await confirm({
      title: t("roleDeleteTitle"),
      description: t("roleDeleteWarning", { name: role.name }),
      confirmLabel: t("roleDelete"),
      cancelLabel: t("topicCancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeRole({ token, roleId: role.id });
      toast.success(t("userUpdatedToast"));
    } catch (err) {
      handleError(err);
    }
  }

  const canCreate = !isSuperAdmin || !!companyId;

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isSuperAdmin && (
            <Select
              value={companyId ?? undefined}
              onValueChange={(v) => setCompanyId(v as Id<"companies">)}
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder={t("rolesCompanyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {companies?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            className="sm:ml-auto"
            onClick={() => setEditing("new")}
            disabled={!canCreate}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("roleNew")}
          </Button>
        </div>

        {isSuperAdmin && !companyId ? (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("rolesCompanyEmpty")}
            </p>
          </Card>
        ) : roles === undefined ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : roles.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-muted-foreground">{t("rolesEmpty")}</p>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("roleNameLabel")}</TableHead>
                  <TableHead>{t("rolesPermissionsLabel")}</TableHead>
                  <TableHead className="text-right">{t("rowActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setEditing(role)}
                        className="flex items-center gap-2 text-left font-medium"
                      >
                        {role.name}
                        {role.isBuiltIn && (
                          <Badge variant="muted" className="text-[10px]">
                            {t("roleBuiltInBadge")}
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t("rolePermissionCount", {
                        count: role.permissions.length,
                        total: PERMISSIONS.length,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionMenu
                        ariaLabel={t("rowActions")}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={t("rowActions")}>
                            <MoreHorizontal />
                          </Button>
                        }
                        items={[
                          {
                            key: "edit",
                            label: t("roleEditTitle"),
                            icon: <Pencil />,
                            onSelect: () => setEditing(role),
                          },
                          ...(role.isBuiltIn
                            ? []
                            : [
                                { key: "sep", separator: true as const },
                                {
                                  key: "delete",
                                  label: t("roleDelete"),
                                  icon: <Trash2 />,
                                  onSelect: () => void handleDelete(role),
                                  destructive: true,
                                },
                              ]),
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
      <RoleDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        token={token}
        role={editing === "new" || editing === null ? null : editing}
        companyId={companyId}
      />
    </>
  );
}
