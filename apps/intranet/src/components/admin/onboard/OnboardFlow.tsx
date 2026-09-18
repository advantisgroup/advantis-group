"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useQuery } from "convex/react";
import { CheckCircle2, Mail, Send, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function SuccessCard({ email, onReset }: { email: string; onReset: () => void }) {
  const t = useTranslations("Admin");
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-ok/12 text-ok">
        <CheckCircle2 className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{t("onboardSuccessTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("onboardSuccessDescription", { email })}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onReset} className="mt-2">
        {t("onboardInviteAnother")}
      </Button>
    </Card>
  );
}

function PersonalEmailFlow({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const create = useAction(api.people.invites.create);
  const departments = useQuery(api.org.structure.listDepartments, {}) ?? [];
  const teams = useQuery(api.org.structure.listTeams, {}) ?? [];

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [departmentId, setDepartmentId] = useState<string>(NONE);
  const [teamId, setTeamId] = useState<string>(NONE);
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setRole("employee");
    setDepartmentId(NONE);
    setTeamId(NONE);
    setJobTitle("");
    setPhone("");
    setSentEmail(null);
  }

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return;
    setBusy(true);
    try {
      await create({
        email: trimmed,
        role,
        departmentId: departmentId === NONE ? undefined : (departmentId as Id<"departments">),
        teamIds: teamId === NONE ? undefined : [teamId as Id<"teams">],
        jobTitle: jobTitle.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success(t("sendInvite"));
      setSentEmail(trimmed);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  if (sentEmail) return <SuccessCard email={sentEmail} onReset={reset} />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("onboardPersonalIntro")}</p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("inviteEmail")}</label>
        <Input
          type="email"
          autoFocus
          placeholder="name@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("onboardFieldDepartment")}
          </label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder={t("onboardFieldDepartmentPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("onboardFieldNone")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("onboardFieldTeam")}
          </label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger>
              <SelectValue placeholder={t("onboardFieldTeamPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("onboardFieldNone")}</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team._id} value={team._id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("onboardFieldJobTitle")}
          </label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {t("onboardFieldPhone")}
          </label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("role")}</label>
        <RoleSelect value={role} onChange={setRole} canElevate={isAdmin} />
      </div>

      <Button onClick={() => void submit()} disabled={busy || !email.trim()} className="w-full">
        <UserPlus className="mr-2 size-4" />
        {t("onboardSubmitPersonal")}
      </Button>
    </div>
  );
}

function CompanyEmailGuide({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const create = useAction(api.people.invites.create);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [busy, setBusy] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | null>(null);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return;
    setBusy(true);
    try {
      await create({ email: trimmed, role });
      toast.success(t("sendInvite"));
      setSentEmail(trimmed);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  if (sentEmail) {
    return (
      <SuccessCard
        email={sentEmail}
        onReset={() => {
          setEmail("");
          setRole("employee");
          setSentEmail(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{t("onboardCompanyIntro1")}</p>
        <p>{t("onboardCompanyIntro2")}</p>
      </div>

      <Card nested className="space-y-3 p-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("inviteEmail")}</label>
          <Input
            type="email"
            placeholder="name@advantisgroup.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("role")}</label>
          <RoleSelect value={role} onChange={setRole} canElevate={isAdmin} />
        </div>
        <Button
          onClick={() => void submit()}
          disabled={busy || !email.trim()}
          className="w-full sm:w-auto"
        >
          <Send className="mr-2 size-4" />
          {t("sendInvite")}
        </Button>
      </Card>
    </div>
  );
}

export function OnboardFlow({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("Admin");
  const [mode, setMode] = useState<"personal" | "company">("personal");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={t("onboardModeLabel")}
        className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/50 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "personal"}
          onClick={() => setMode("personal")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            mode === "personal"
              ? "bg-card text-fg shadow-sm"
              : "text-muted-foreground hover:text-fg",
          )}
        >
          <UserPlus className="size-4" />
          {t("onboardModePersonal")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "company"}
          onClick={() => setMode("company")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            mode === "company"
              ? "bg-card text-fg shadow-sm"
              : "text-muted-foreground hover:text-fg",
          )}
        >
          <Mail className="size-4" />
          {t("onboardModeCompany")}
        </button>
      </div>

      {mode === "personal" ? (
        <PersonalEmailFlow isAdmin={isAdmin} />
      ) : (
        <CompanyEmailGuide isAdmin={isAdmin} />
      )}
    </div>
  );
}
