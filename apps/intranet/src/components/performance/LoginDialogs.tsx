"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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

export interface LoginRow {
  id: Id<"performanceLogins">;
  email: string;
  name: string;
  role: "admin" | "mitarbeiter";
  active: boolean;
  employeeId: Id<"performanceEmployees"> | null;
  employeeName: string | null;
}

export interface EmployeeOption {
  id: Id<"performanceEmployees">;
  name: string;
  active: boolean;
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

export function CreateLoginDialog({
  open,
  onOpenChange,
  token,
  employees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  employees: EmployeeOption[];
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const createLogin = useAction(api.performanceAuth.createLogin);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "mitarbeiter">("mitarbeiter");
  const [employeeId, setEmployeeId] = useState(NONE);
  const [saving, setSaving] = useState(false);

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setRole("mitarbeiter");
    setEmployeeId(NONE);
  }

  async function handleSave() {
    if (!email.trim() || !name.trim() || password.length < 8) return;
    setSaving(true);
    try {
      await createLogin({
        token,
        email: email.trim(),
        name: name.trim(),
        password,
        role,
        employeeId:
          employeeId === NONE
            ? undefined
            : (employeeId as Id<"performanceEmployees">),
      });
      reset();
      onOpenChange(false);
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("userRoleLabel")}
              </label>
              <Select
                value={role}
                onValueChange={v => setRole(v as "admin" | "mitarbeiter")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("userRoleAdmin")}</SelectItem>
                  <SelectItem value="mitarbeiter">
                    {t("userRoleEmployee")}
                  </SelectItem>
                </SelectContent>
              </Select>
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
            disabled={
              saving || !email.trim() || !name.trim() || password.length < 8
            }
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
}: {
  login: LoginRow | null;
  onOpenChange: (open: boolean) => void;
  token: string;
  employees: EmployeeOption[];
}) {
  const handleError = useErrorHandler();
  const updateLogin = useMutation(api.performanceAuth.updateLogin);

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
            onCancel={() => onOpenChange(false)}
            onSave={async patch => {
              try {
                await updateLogin({ token, loginId: login.id, ...patch });
                onOpenChange(false);
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
  onCancel,
  onSave,
}: {
  login: LoginRow;
  employees: EmployeeOption[];
  onCancel: () => void;
  onSave: (patch: {
    name: string;
    role: "admin" | "mitarbeiter";
    active: boolean;
    employeeId: Id<"performanceEmployees"> | null;
  }) => void | Promise<void>;
}) {
  const t = useTranslations("Performance");
  const [name, setName] = useState(login.name);
  const [role, setRole] = useState(login.role);
  const [active, setActive] = useState(login.active);
  const [employeeId, setEmployeeId] = useState(login.employeeId ?? NONE);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || login.name,
        role,
        active,
        employeeId:
          employeeId === NONE
            ? null
            : (employeeId as Id<"performanceEmployees">),
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("userRoleLabel")}
            </label>
            <Select
              value={role}
              onValueChange={v => setRole(v as "admin" | "mitarbeiter")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("userRoleAdmin")}</SelectItem>
                <SelectItem value="mitarbeiter">
                  {t("userRoleEmployee")}
                </SelectItem>
              </SelectContent>
            </Select>
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
        <label className="flex w-fit items-center gap-2 pt-1 text-sm">
          <Checkbox
            checked={active}
            onCheckedChange={checked => setActive(checked === true)}
          />
          {t("userActiveLabel")}
        </label>
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
