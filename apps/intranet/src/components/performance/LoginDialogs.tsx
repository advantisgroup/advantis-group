"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InfoTip } from "@/components/ui/info-tip";
import { PersonPicker, type PersonOption } from "@/components/people/PersonPicker";
import { usePerformanceCompanySlug } from "@/components/performance/PerformanceCompanyProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";

export interface LoginRow {
  id: Id<"performanceLogins">;
  email: string;
  name: string;
  roleId: Id<"companyRoles"> | null;
  roleName: string | null;
  isSuperAdmin: boolean;
  active: boolean;
  employeeId: Id<"performanceEmployees"> | null;
  employeeName: string | null;
  linkedUserId: Id<"users"> | null;
  linkedUserName: string | null;
  autoLinked: boolean;
}

export interface EmployeeOption {
  id: Id<"performanceEmployees">;
  name: string;
  active: boolean;
}

export interface RoleOption {
  id: Id<"companyRoles">;
  name: string;
}

export type IntranetUserOption = PersonOption & { linkedToLoginName: string | null };

/** The intranet account whose email exactly matches `email`, if any — most
 * existing Performance logins use a different (e.g. consulting-for-*)
 * address than the person's intranet account, so this only pre-fills the
 * picker when it happens to line up; an admin always picks manually
 * otherwise. */
function suggestIntranetUser(
  users: IntranetUserOption[],
  email: string,
): IntranetUserOption | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return users.find((u) => u.email.toLowerCase() === normalized) ?? null;
}

const NONE = "__none__";

function EmployeeSelect({
  value,
  onChange,
  employees,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  employees: EmployeeOption[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {employees.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RoleSelect({
  value,
  onChange,
  roles,
}: {
  value: string;
  onChange: (v: string) => void;
  roles: RoleOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Links a Performance login to an intranet account. The login's own email
 * often doesn't match (consulting-for-* addresses), so the avatar and
 * position in the list are what let an admin confirm the right person. */
function IntranetUserPicker({
  value,
  onChange,
  users,
  placeholder,
}: {
  value: Id<"users"> | null;
  onChange: (v: Id<"users"> | null) => void;
  users: IntranetUserOption[];
  placeholder: string;
}) {
  const t = useTranslations("Performance");
  const linkedTo = new Map(users.map((u) => [u.userId, u.linkedToLoginName]));
  return (
    <PersonPicker
      value={value}
      onChange={(userId) => onChange(userId)}
      people={users}
      label={t("userIntranetAccountLabel")}
      noneLabel={placeholder}
      hint={(person) =>
        linkedTo.get(person.userId) && person.userId !== value ? t("userAlreadyLinkedBadge") : null
      }
    />
  );
}

export function CreateLoginDialog({
  open,
  onOpenChange,
  token,
  employees,
  intranetUsers,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  employees: EmployeeOption[];
  intranetUsers: IntranetUserOption[];
  roles: RoleOption[];
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const createLogin = useAction(api.performance.auth.createLogin);
  // Only Advantis has staff with intranet Clerk accounts to link — every
  // other company's "users" is naturally empty (and the field itself would
  // be a confusing dead end for a client admin), so the whole picker is
  // Advantis-only, not just its data.
  const showIntranetLink = usePerformanceCompanySlug() === "advantis";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState(NONE);
  const [linkedUserId, setLinkedUserId] = useState<Id<"users"> | null>(null);
  const [linkedUserTouched, setLinkedUserTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-fill the link from a matching intranet email, same as the edit
  // dialog — most Performance logins use a different address, so this
  // rarely fires, but it's a convenient shortcut when it does. Only
  // suggests until the admin has touched the picker themself.
  const suggested = useMemo(
    () => suggestIntranetUser(intranetUsers, email),
    [intranetUsers, email],
  );
  const effectiveLinkedUserId = linkedUserTouched ? linkedUserId : (suggested?.userId ?? null);

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setRoleId(roles[0]?.id ?? "");
    setEmployeeId(NONE);
    setLinkedUserId(null);
    setLinkedUserTouched(false);
  }

  const needsPassword = !effectiveLinkedUserId;
  const canSave =
    !!email.trim() && !!name.trim() && !!roleId && (!needsPassword || password.length >= 8);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await createLogin({
        token,
        email: email.trim(),
        name: name.trim(),
        password: needsPassword ? password : undefined,
        roleId: roleId as Id<"companyRoles">,
        employeeId: employeeId === NONE ? undefined : (employeeId as Id<"performanceEmployees">),
        linkedUserId: effectiveLinkedUserId ?? undefined,
      });
      reset();
      onOpenChange(false);
      toast.success(t("userCreatedToast"));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">{t("userNewTitle")}</DialogTitle>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("emailLabel")}</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t("nameLabel")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {showIntranetLink && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("userIntranetAccountLabel")}
              </label>
              <IntranetUserPicker
                value={effectiveLinkedUserId}
                onChange={(v) => {
                  setLinkedUserId(v);
                  setLinkedUserTouched(true);
                }}
                users={intranetUsers}
                placeholder={t("userIntranetAccountNone")}
              />
            </div>
          )}
          {needsPassword ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("passwordLabel")}
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("userPasswordNotNeeded")}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("userRoleLabel")}
              </label>
              <RoleSelect value={roleId} onChange={setRoleId} roles={roles} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("userEmployeeLabel")}
              </label>
              <EmployeeSelect
                value={employeeId}
                onChange={setEmployeeId}
                employees={employees}
                placeholder={t("userEmployeeNone")}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !canSave}>
            {t("topicSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditLoginDialog({
  login,
  onOpenChange,
  token,
  employees,
  intranetUsers,
  roles,
  viewerIsSuperAdmin,
  viewerLoginId,
}: {
  login: LoginRow | null;
  onOpenChange: (open: boolean) => void;
  token: string;
  employees: EmployeeOption[];
  intranetUsers: IntranetUserOption[];
  roles: RoleOption[];
  viewerIsSuperAdmin: boolean;
  viewerLoginId: Id<"performanceLogins"> | null;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const updateLogin = useMutation(api.performance.auth.updateLogin);
  const setSuperAdmin = useMutation(api.performance.auth.setSuperAdmin);

  return (
    <Dialog
      open={login !== null}
      onOpenChange={(o) => {
        if (!o) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        {login && (
          <EditLoginForm
            key={login.id}
            login={login}
            employees={employees}
            intranetUsers={intranetUsers}
            roles={roles}
            viewerIsSuperAdmin={viewerIsSuperAdmin}
            viewerLoginId={viewerLoginId}
            onCancel={() => onOpenChange(false)}
            onSave={async ({ isSuperAdmin, ...patch }) => {
              try {
                if (isSuperAdmin !== login.isSuperAdmin) {
                  await setSuperAdmin({
                    token,
                    loginId: login.id,
                    isSuperAdmin,
                  });
                }
                await updateLogin({ token, loginId: login.id, ...patch });
                onOpenChange(false);
                toast.success(t("userUpdatedToast"));
              } catch (err) {
                handleError(err);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditLoginForm({
  login,
  employees,
  intranetUsers,
  roles,
  viewerIsSuperAdmin,
  viewerLoginId,
  onCancel,
  onSave,
}: {
  login: LoginRow;
  employees: EmployeeOption[];
  intranetUsers: IntranetUserOption[];
  roles: RoleOption[];
  viewerIsSuperAdmin: boolean;
  viewerLoginId: Id<"performanceLogins"> | null;
  onCancel: () => void;
  onSave: (patch: {
    name: string;
    roleId: Id<"companyRoles"> | undefined;
    active: boolean;
    employeeId: Id<"performanceEmployees"> | null;
    linkedUserId: Id<"users"> | null;
    isSuperAdmin: boolean;
  }) => void | Promise<void>;
}) {
  const t = useTranslations("Performance");
  const showIntranetLink = usePerformanceCompanySlug() === "advantis";
  const [name, setName] = useState(login.name);
  const [roleId, setRoleId] = useState<string>(login.roleId ?? roles[0]?.id ?? "");
  const [active, setActive] = useState(login.active);
  const [employeeId, setEmployeeId] = useState(login.employeeId ?? NONE);
  // Existing logins are never re-linked automatically: if this one is
  // already linked (or was manually left unlinked before), that choice
  // stands. Only a login with no explicit choice yet falls back to a
  // matching-email suggestion — an admin can still override either way.
  const [linkedUserId, setLinkedUserId] = useState<Id<"users"> | null>(
    login.linkedUserId ?? suggestIntranetUser(intranetUsers, login.email)?.userId ?? null,
  );
  const [isSuperAdmin, setIsSuperAdmin] = useState(login.isSuperAdmin);
  const [saving, setSaving] = useState(false);

  // Only another super-admin can grant/revoke the flag, and never on their
  // own login — see performanceAuth.ts's setSuperAdmin for why.
  const canToggleSuperAdmin = viewerIsSuperAdmin && login.id !== viewerLoginId;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || login.name,
        roleId: isSuperAdmin ? undefined : (roleId as Id<"companyRoles">),
        active,
        employeeId: employeeId === NONE ? null : (employeeId as Id<"performanceEmployees">),
        linkedUserId,
        isSuperAdmin,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
        <DialogTitle className="leading-snug">{t("userEditTitle")}</DialogTitle>
        <p className="text-sm text-muted-foreground">{login.email}</p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("nameLabel")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {showIntranetLink && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("userIntranetAccountLabel")}
            </label>
            <IntranetUserPicker
              value={linkedUserId}
              onChange={setLinkedUserId}
              users={intranetUsers}
              placeholder={t("userIntranetAccountNone")}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("userRoleLabel")}
            </label>
            {isSuperAdmin ? (
              <p className="pt-2 text-sm text-muted-foreground">{t("userRoleSuperAdmin")}</p>
            ) : (
              <RoleSelect value={roleId} onChange={setRoleId} roles={roles} />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("userEmployeeLabel")}
            </label>
            <EmployeeSelect
              value={employeeId}
              onChange={setEmployeeId}
              employees={employees}
              placeholder={t("userEmployeeNone")}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(checked) => setActive(checked === true)} />
            {t("userActiveLabel")}
          </label>
          {canToggleSuperAdmin && (
            <label className="flex w-fit items-center gap-1.5 text-sm">
              <Checkbox
                checked={isSuperAdmin}
                onCheckedChange={(checked) => setIsSuperAdmin(checked === true)}
              />
              {t("userSuperAdminToggleLabel")}
              <InfoTip text={t("userSuperAdminToggleInfo")} />
            </label>
          )}
        </div>
      </div>
      <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
        <Button variant="ghost" onClick={onCancel}>
          {t("topicCancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {t("topicSave")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ResetPasswordDialog({
  loginId,
  onOpenChange,
  token,
}: {
  loginId: Id<"performanceLogins"> | null;
  onOpenChange: (open: boolean) => void;
  token: string;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const resetLoginPassword = useAction(api.performance.auth.resetLoginPassword);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!loginId || password.length < 8) return;
    setSaving(true);
    try {
      await resetLoginPassword({ token, loginId, password });
      setPassword("");
      onOpenChange(false);
      toast.success(t("userPasswordResetToast"));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={loginId !== null}
      onOpenChange={(o) => {
        if (!o) {
          setPassword("");
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">{t("userResetPasswordTitle")}</DialogTitle>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("userNewPasswordLabel")}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || password.length < 8}>
            {t("topicSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
