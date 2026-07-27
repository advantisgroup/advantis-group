"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation } from "convex/react";
import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { InfoTip } from "@/components/activity/InfoTip";
import { usePerformanceCompanySlug } from "@/components/performance/PerformanceCompanyProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";

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

export interface IntranetUserOption {
  id: Id<"users">;
  name: string;
  email: string;
  avatarUrl: string | null;
  linkedToLoginName: string | null;
}

/** The intranet account whose email exactly matches `email`, if any — most
 * existing Performance logins use a different (e.g. consulting-for-*)
 * address than the person's intranet account, so this only pre-fills the
 * picker when it happens to line up; an admin always picks manually
 * otherwise. */
function suggestIntranetUser(
  users: IntranetUserOption[],
  email: string
): IntranetUserOption | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return users.find(u => u.email.toLowerCase() === normalized) ?? null;
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
        {employees.map(e => (
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
        {roles.map(r => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Searchable avatar+name+email picker for linking a Performance login to an
 * intranet (Clerk) account — a plain `Select` doesn't scale to the ~50-200
 * intranet accounts this draws from, and showing the avatar lets an admin
 * visually confirm the right person even when the Performance login's own
 * email doesn't match (e.g. a consulting-for-* address), which is the
 * common case this picker exists for.
 *
 * Deliberately not a Radix `Popover`: this always renders inside a `Dialog`,
 * and nesting one portaled Radix overlay's trigger inside another's content
 * is a known source of swallowed taps on touch devices (the Dialog's
 * dismissable layer can eat the pointer event meant for the Popover
 * trigger) — confirmed broken on mobile Safari. Rendering the expanded list
 * directly in the form's own DOM subtree (same stacking context as the
 * Dialog, no second portal) sidesteps that entirely. */
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = users.find(u => u.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  function close() {
    setOpen(false);
    setSearch("");
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between gap-2 font-normal"
        onClick={() => setOpen(o => !o)}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar className="size-5 shrink-0">
              {selected.avatarUrl && (
                <AvatarImage src={selected.avatarUrl} alt={selected.name} />
              )}
              <AvatarFallback className="text-[9px]">
                {initials(selected.name, selected.email)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border/70 bg-card shadow-overlay">
          <div className="border-b p-2">
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("userIntranetAccountSearch")}
              className="h-8"
            />
          </div>
          <ScrollArea className="h-64">
            <button
              type="button"
              className="flex w-full items-center border-b border-border/60 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              {placeholder}
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("userIntranetAccountEmpty")}
              </p>
            ) : (
              filtered.map(u => {
                const linkedElsewhere = u.linkedToLoginName && u.id !== value;
                return (
                  <button
                    type="button"
                    key={u.id}
                    className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                    onClick={() => {
                      onChange(u.id);
                      close();
                    }}
                  >
                    <Avatar className="size-8 shrink-0">
                      {u.avatarUrl && (
                        <AvatarImage src={u.avatarUrl} alt={u.name} />
                      )}
                      <AvatarFallback className="text-xs">
                        {initials(u.name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email}
                      </p>
                    </div>
                    {linkedElsewhere && (
                      <Badge variant="muted" className="shrink-0 text-[10px]">
                        {t("userAlreadyLinkedBadge")}
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </div>
      )}
    </div>
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
  const createLogin = useAction(api.performanceAuth.createLogin);
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
    [intranetUsers, email]
  );
  const effectiveLinkedUserId = linkedUserTouched
    ? linkedUserId
    : (suggested?.id ?? null);

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
    !!email.trim() &&
    !!name.trim() &&
    !!roleId &&
    (!needsPassword || password.length >= 8);

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
        employeeId:
          employeeId === NONE
            ? undefined
            : (employeeId as Id<"performanceEmployees">),
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
      onOpenChange={o => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {t("userNewTitle")}
          </DialogTitle>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("emailLabel")}
            </label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("nameLabel")}
            </label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          {showIntranetLink && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("userIntranetAccountLabel")}
              </label>
              <IntranetUserPicker
                value={effectiveLinkedUserId}
                onChange={v => {
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
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("userPasswordNotNeeded")}
            </p>
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
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
          >
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
  const updateLogin = useMutation(api.performanceAuth.updateLogin);
  const setSuperAdmin = useMutation(api.performanceAuth.setSuperAdmin);

  return (
    <Dialog
      open={login !== null}
      onOpenChange={o => {
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
  const [roleId, setRoleId] = useState<string>(
    login.roleId ?? roles[0]?.id ?? ""
  );
  const [active, setActive] = useState(login.active);
  const [employeeId, setEmployeeId] = useState(login.employeeId ?? NONE);
  // Existing logins are never re-linked automatically: if this one is
  // already linked (or was manually left unlinked before), that choice
  // stands. Only a login with no explicit choice yet falls back to a
  // matching-email suggestion — an admin can still override either way.
  const [linkedUserId, setLinkedUserId] = useState<Id<"users"> | null>(
    login.linkedUserId ??
      suggestIntranetUser(intranetUsers, login.email)?.id ??
      null
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
        employeeId:
          employeeId === NONE
            ? null
            : (employeeId as Id<"performanceEmployees">),
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
          <label className="text-xs font-medium text-muted-foreground">
            {t("nameLabel")}
          </label>
          <Input value={name} onChange={e => setName(e.target.value)} />
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
              <p className="pt-2 text-sm text-muted-foreground">
                {t("userRoleSuperAdmin")}
              </p>
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
            <Checkbox
              checked={active}
              onCheckedChange={checked => setActive(checked === true)}
            />
            {t("userActiveLabel")}
          </label>
          {canToggleSuperAdmin && (
            <label className="flex w-fit items-center gap-1.5 text-sm">
              <Checkbox
                checked={isSuperAdmin}
                onCheckedChange={checked => setIsSuperAdmin(checked === true)}
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
  const resetLoginPassword = useAction(api.performanceAuth.resetLoginPassword);
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
      onOpenChange={o => {
        if (!o) {
          setPassword("");
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {t("userResetPasswordTitle")}
          </DialogTitle>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("userNewPasswordLabel")}
            </label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || password.length < 8}
          >
            {t("topicSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
