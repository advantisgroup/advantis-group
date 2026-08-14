"use client";

import { useState, type ReactNode } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  Building2,
  Cake,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  Copy,
  Hash,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  UploadCloud,
  UserMinus,
  Users2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { RoleSelect } from "@/app/(app)/admin/RoleSelect";
import { VaultStepUpDialog } from "@/components/applicants/VaultStepUpDialog";
import { useCurrentUser, useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { addDaysIso, isoToday } from "@/lib/absences";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { useNow } from "@/lib/activity/useNow";
import { formatIsoDate, initials, roleLabel } from "@/lib/format";
import { profileColorStyle, profileGradientClass } from "@/lib/profile-gradient";
import { TEAMS, teamColor, teamLabelKey } from "@/lib/teams";
import { cn } from "@/lib/utils";

type ProfileUser = NonNullable<ReturnType<typeof useUser>>;

/**
 * Full-width, left-aligned, wrapping button style for the admin action list.
 * The default Button is `whitespace-nowrap` at a fixed height, which is fine
 * for short English labels but overflows German ones (e.g.
 * "Geschäftsführungs-Zugriff gewähren") — this lets them wrap onto a second
 * line instead of spilling into whatever sits next to the button.
 */
const actionButtonClass =
  "h-auto min-h-8 w-full items-start justify-start whitespace-normal py-1.5 text-left [&_svg]:mt-0.5";

function useUser(userId: Id<"users"> | null) {
  return useQuery(api.users.get, userId ? { userId } : "skip");
}

/** A small labelled section so the profile reads like a tidy info card. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The single body card every profile detail lives in — one inset panel with
 * hairline-separated `Section`s, rather than each section floating on the
 * dialog background. Padding is applied to the direct children so the
 * sections themselves stay layout-agnostic (several of them render `null`
 * when empty, which the divider handles for free).
 */
function InfoPanel({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-panel-2/50 [&>*]:px-4 [&>*]:py-3.5">
      {children}
    </div>
  );
}

/** One `label: value` line in the profile's details section. */
function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function TeamsEditor({ userId, teams }: { userId: Id<"users">; teams: string[] }) {
  const t = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const setTeams = useMutation(api.users.setTeams);
  const handleError = useErrorHandler();

  function toggle(id: string) {
    const next = teams.includes(id) ? teams.filter((x) => x !== id) : [...teams, id];
    setTeams({ userId, teams: next }).catch(handleError);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Users2 className="size-3.5" />
          {t("teams")}
          {teams.length > 0 && (
            <span className="ml-0.5 flex items-center gap-1">
              {teams.map((id) => (
                <span key={id} className={cn("size-1.5 rounded-full", teamColor(id))} />
              ))}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("teams")}</span>
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {teams.length}/{TEAMS.length}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TEAMS.map((team) => {
          const checked = teams.includes(team.id);
          return (
            <DropdownMenuCheckboxItem
              key={team.id}
              checked={checked}
              onCheckedChange={() => toggle(team.id)}
              onSelect={(e) => e.preventDefault()}
              className="gap-2 py-1.5"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-opacity",
                  teamColor(team.id),
                  checked ? "opacity-100" : "opacity-40",
                )}
              />
              <span className="flex-1">{tTeams(team.labelKey)}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A single contact line: icon + value, optionally a mailto:/tel: link + copy. */
function ContactRow({
  icon,
  value,
  href,
  onCopy,
}: {
  icon: ReactNode;
  value: string;
  href?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      {href ? (
        <a href={href} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">
          {value}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate">{value}</span>
      )}
      {onCopy && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={onCopy}
        >
          <Copy className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** How recent a presence heartbeat still counts as "online". */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function Organisation({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Profile");
  const org = useQuery(api.users.orgContext, { userId });
  if (!org || (!org.manager && org.reports.length === 0)) return null;

  const personRow = (p: {
    _id: string;
    name: string;
    jobTitle: string | null;
    avatar: string | null;
  }) => (
    <div
      key={p._id}
      className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2"
    >
      <Avatar className="size-7 shrink-0">
        {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
        <AvatarFallback className="text-[10px]">{initials(p.name, "")}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
      {p.jobTitle && <span className="shrink-0 text-xs text-muted-foreground">{p.jobTitle}</span>}
    </div>
  );

  return (
    <Section label={t("organisation")}>
      <div className="space-y-2">
        {org.manager && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("manager")}</p>
            {personRow(org.manager)}
          </div>
        )}
        {org.reports.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("reports", { count: org.reports.length })}
            </p>
            <div className="space-y-1">{org.reports.map(personRow)}</div>
          </div>
        )}
      </div>
    </Section>
  );
}

function MutualConversations({
  userId,
  onNavigate,
}: {
  userId: Id<"users">;
  onNavigate: () => void;
}) {
  const t = useTranslations("Profile");
  const router = useRouter();
  const mutual = useQuery(api.chat.mutualConversations, {
    otherUserId: userId,
  });

  if (!mutual || mutual.length === 0) return null;

  return (
    <Section label={t("mutual")}>
      <div className="space-y-1">
        {mutual.map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => {
              router.push(`/chat?c=${c._id}`);
              onNavigate();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent/50"
          >
            {c.type === "dm" ? (
              <Avatar className="size-7 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
                <AvatarFallback className="text-[10px]">{initials(c.title, "")}</AvatarFallback>
              </Avatar>
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-panel-2 text-muted-foreground">
                <Hash className="size-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
            {c.type === "group" && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("memberCount", { count: c.memberCount })}
              </span>
            )}
          </button>
        ))}
      </div>
    </Section>
  );
}

function UpcomingAbsences({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Profile");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const today = isoToday();
  // No fixed end date for "upcoming" — a wide-enough window covers any
  // realistically pre-planned absence without needing an open-ended query.
  const calendar = useAbsencesCalendar(today, addDaysIso(today, 180));
  const absences = calendar
    ?.filter((a) => a.userId === userId && a.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  if (!absences || absences.length === 0) return null;

  return (
    <Section label={t("upcoming")}>
      <div className="space-y-1.5">
        {absences.map((a) => {
          const range =
            a.startDate === a.endDate
              ? formatIsoDate(a.startDate, locale)
              : `${formatIsoDate(a.startDate, locale)} – ${formatIsoDate(a.endDate, locale)}`;
          return (
            <div
              key={a.id}
              className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2 text-sm"
            >
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{tAbs(a.type)}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {range}
                {a.halfDay ? " · ½" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

type StarterStep = { key: string; complete: boolean };

/**
 * Which "is this account actually set up" details are still missing. Lives
 * outside the checklist component because the management rail needs the
 * outstanding count to decide whether the setup tab is worth showing at all.
 */
function starterSteps(user: ProfileUser): StarterStep[] {
  return [
    { key: "photo", complete: Boolean(user.avatar) },
    { key: "contact", complete: Boolean(user.jobTitle && user.phone) },
    { key: "department", complete: Boolean(user.department) },
    { key: "team", complete: user.teams.length > 0 },
    { key: "clockodo", complete: user.clockodoUserId !== null },
    { key: "hireDate", complete: Boolean(user.hireDate) },
  ];
}

function StarterChecklist({ steps }: { steps: StarterStep[] }) {
  const t = useTranslations("Profile");
  const completed = steps.filter((step) => step.complete).length;

  return (
    <Section label={t("starterChecklist")}>
      <p className="text-xs text-muted-foreground">
        {t("starterChecklistProgress", { completed, total: steps.length })}
      </p>
      <div className="mt-2 space-y-1 rounded-lg border border-border/70 p-2">
        {steps.map((step) => {
          const Icon = step.complete ? CheckCircle2 : Circle;
          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
                step.complete ? "text-muted-foreground" : "font-medium",
              )}
            >
              <Icon className={cn("size-4 shrink-0", step.complete && "text-success")} />
              <span>{t(`starterChecklist_${step.key}`)}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

type OffboardingRecord = FunctionReturnType<typeof api.offboarding.get>;

function OffboardingChecklist({
  user,
  checklist,
}: {
  user: ProfileUser;
  /** `undefined` while the query is still loading, `null` when none exists. */
  checklist: OffboardingRecord | undefined;
}) {
  const t = useTranslations("Profile");
  const setLastWorkingDay = useMutation(api.offboarding.setLastWorkingDay);
  const setStep = useMutation(api.offboarding.setStep);
  const handleError = useErrorHandler();
  const steps = ["handover", "tickets", "guidebooks", "files", "devices", "access"] as const;
  const completed = checklist?.completedSteps.length ?? 0;

  return (
    <Section label={t("offboardingChecklist")}>
      <p className="text-xs text-muted-foreground">
        {t("offboardingChecklistProgress", { completed, total: steps.length })}
      </p>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">
        {t("offboardingLastWorkingDay")}
        <Input
          key={checklist?._id ?? "new"}
          type="date"
          defaultValue={checklist?.lastWorkingDay ?? ""}
          className="mt-1 h-8"
          onBlur={(event) =>
            void setLastWorkingDay({
              userId: user._id,
              lastWorkingDay: event.target.value || undefined,
            }).catch(handleError)
          }
        />
      </label>
      <div className="mt-3 space-y-2 rounded-lg border border-border/70 p-2">
        {steps.map((step) => {
          const complete = checklist?.completedSteps.includes(step) ?? false;
          return (
            <label
              key={step}
              className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-sm"
            >
              <Checkbox
                checked={complete}
                onCheckedChange={(checked) =>
                  void setStep({ userId: user._id, step, complete: checked === true }).catch(
                    handleError,
                  )
                }
              />
              <span className={cn(complete && "text-muted-foreground line-through")}>
                {t(`offboarding_${step}`)}
              </span>
            </label>
          );
        })}
      </div>
    </Section>
  );
}

function AdminControls({
  user,
  isAdmin,
  onClose,
}: {
  user: ProfileUser;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const tCustomRoles = useTranslations("CustomRoles");
  const tApplicants = useTranslations("Applicants");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const setRole = useMutation(api.users.setRole);
  const setStatus = useAction(api.users.setStatus);
  const removeMember = useAction(api.members.remove);
  const reinvite = useAction(api.members.reinvite);
  const setUploadPermission = useAction(api.users.setUploadPermission);
  const setGfAccess = useAction(api.users.setGfAccess);
  const setApplicantDelegate = useMutation(api.users.setApplicantDelegate);
  const handleError = useErrorHandler();

  const isSelf = user._id === me._id;
  const isActive = user.status === "active";
  // Admins can be demoted via the role picker, but not suspended or removed
  // outright — that would let one admin lock another out of their own
  // account. Backend rejects these too; this just keeps the UI from
  // offering an action that's guaranteed to fail.
  const isTargetAdmin = user.role === "admin";

  function changeRole(role: Role) {
    setRole({ userId: user._id, role })
      .then(() => toast.success(tRoles(role)))
      .catch(handleError);
  }

  async function toggleStatus() {
    if (isActive) {
      const ok = await confirm({
        title: t("suspend"),
        description: tc("deleteWarning"),
        confirmLabel: t("suspend"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    setStatus({
      userId: user._id,
      status: isActive ? "suspended" : "active",
    }).catch(handleError);
  }

  async function onRemove() {
    const ok = await confirm({
      title: t("removeTitle", { name: user.name }),
      description: t("removeBody"),
      confirmLabel: t("removeMember"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    onClose();
    removeMember({ userId: user._id })
      .then(() => toast.success(t("removed")))
      .catch(handleError);
  }

  function onReinvite() {
    reinvite({ userId: user._id })
      .then(() => toast.success(t("reinviteSent")))
      .catch(handleError);
  }

  function toggleUploads() {
    setUploadPermission({
      userId: user._id,
      enabled: !user.uploadRequestsEnabled,
    })
      .then(() =>
        toast.success(user.uploadRequestsEnabled ? t("uploadsDisabled") : t("uploadsEnabled")),
      )
      .catch(handleError);
  }

  function toggleGf() {
    setGfAccess({ userId: user._id, gfAccess: !user.gfAccess })
      .then(() => toast.success(user.gfAccess ? t("gfRevoked") : t("gfGranted")))
      .catch(handleError);
  }

  function doToggleApplicantDelegate() {
    setApplicantDelegate({
      userId: user._id,
      delegate: !user.applicantAccessDelegate,
    })
      .then(() =>
        toast.success(
          user.applicantAccessDelegate
            ? t("applicantDelegateRevoked")
            : t("applicantDelegateGranted"),
        ),
      )
      .catch(handleError);
  }

  async function toggleApplicantDelegate() {
    const ok = await confirm({
      title: user.applicantAccessDelegate
        ? t("revokeApplicantDelegate")
        : t("grantApplicantDelegate"),
      description: tApplicants("delegateConfirmDescription", {
        name: user.name,
      }),
      confirmText: { target: user.name },
      confirmLabel: tc("confirm"),
      destructive: !!user.applicantAccessDelegate,
    });
    if (!ok) return;
    setStepUpOpen(true);
  }

  const hasCustomRoles = user.customRoles.length > 0;
  const hasNamedPermissions =
    user.gfAccess || user.applicantAccessDelegate || !user.uploadRequestsEnabled;

  // No section heading: this is the management rail's default tab, so the tab
  // label is already the heading.
  return (
    <div>
      {(hasCustomRoles || hasNamedPermissions) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{t("permissions")}</span>
          {user.customRoles.map((role) => (
            <Tooltip key={role._id}>
              <TooltipTrigger asChild>
                <Badge variant="muted" className="cursor-help gap-1">
                  <ShieldCheck className="size-3" />
                  {role.name}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {role.capabilities.length > 0
                  ? role.capabilities.map((cap) => tCustomRoles(`capability_${cap}`)).join(", ")
                  : tCustomRoles("noCapabilities")}
              </TooltipContent>
            </Tooltip>
          ))}
          {user.gfAccess && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="muted" className="cursor-help">
                  {t("gfBadge")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t("gfAccessTooltip")}
              </TooltipContent>
            </Tooltip>
          )}
          {user.applicantAccessDelegate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="muted" className="cursor-help">
                  {t("applicantDelegateBadge")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                {t("applicantDelegateBadgeTitle")}
              </TooltipContent>
            </Tooltip>
          )}
          {!user.uploadRequestsEnabled && <Badge variant="warning">{t("uploadsDisabled")}</Badge>}
        </div>
      )}
      <div className="space-y-3 rounded-lg border border-border/70 p-3">
        {isAdmin && !isSelf && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("role")}</span>
            <RoleSelect value={user.role} onChange={changeRole} canElevate />
          </div>
        )}
        {isAdmin && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("teams")}</span>
            <TeamsEditor userId={user._id} teams={user.teams} />
          </div>
        )}
        {!isSelf && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("hireDate")}</span>
            <HireDateEditor userId={user._id} hireDate={user.hireDate} />
          </div>
        )}
        {/* Permission grants and lifecycle actions only make sense on
            someone else's account — a member can't grant themselves access
            or reinvite/suspend/remove themselves.
            Stacked full-width rows rather than a 2-up grid: German labels
            ("Geschäftsführungs-Zugriff gewähren") run 2-3x longer than the
            English ones and need room to wrap instead of overflowing a
            fixed-width, `whitespace-nowrap` button. */}
        {!isSelf && (
          <div className="flex flex-col gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className={actionButtonClass}
              onClick={toggleUploads}
            >
              <UploadCloud />
              <span>{user.uploadRequestsEnabled ? t("disableUploads") : t("enableUploads")}</span>
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" className={actionButtonClass} onClick={toggleGf}>
                <Lock />
                <span>{user.gfAccess ? t("revokeGf") : t("grantGf")}</span>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className={actionButtonClass}
                onClick={() => void toggleApplicantDelegate()}
              >
                <Users2 />
                <span>
                  {user.applicantAccessDelegate
                    ? t("revokeApplicantDelegate")
                    : t("grantApplicantDelegate")}
                </span>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className={actionButtonClass}
                onClick={() => onReinvite()}
              >
                <Send /> <span>{t("reinvite")}</span>
              </Button>
            )}
            {isAdmin && !isTargetAdmin && (
              <Button
                variant="outline"
                size="sm"
                className={actionButtonClass}
                onClick={() => void toggleStatus()}
              >
                <ShieldCheck />
                <span>{isActive ? t("suspend") : t("activate")}</span>
              </Button>
            )}
            {isAdmin && !isTargetAdmin && (
              <Button
                variant="destructive"
                size="sm"
                className={actionButtonClass}
                onClick={() => void onRemove()}
              >
                <UserMinus /> <span>{t("removeMember")}</span>
              </Button>
            )}
          </div>
        )}
      </div>
      <VaultStepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onVerified={doToggleApplicantDelegate}
      />
    </div>
  );
}

/**
 * The manager-only right-hand rail. Administration is the landing tab — the
 * two checklists used to sit stacked above it and pushed the controls that
 * actually get used off-screen. The setup tab only appears while something is
 * still missing, and offboarding only once it has been started (or explicitly
 * opened from the admin tab), so neither is in the way on a normal profile.
 */
function ManagementRail({
  user,
  isAdmin,
  onClose,
}: {
  user: ProfileUser;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Profile");
  const checklist = useQuery(api.offboarding.get, { userId: user._id });
  const [offboardingOpened, setOffboardingOpened] = useState(false);
  const [tab, setTab] = useState("manage");

  const steps = starterSteps(user);
  const outstanding = steps.filter((step) => !step.complete).length;
  const showSetup = outstanding > 0;
  const showOffboarding =
    offboardingOpened ||
    Boolean(checklist?.lastWorkingDay) ||
    (checklist?.completedSteps.length ?? 0) > 0;

  // A tab can disappear underneath the selection — completing the last setup
  // detail while the setup tab is open, say — so fall back to the one tab
  // that's always there rather than rendering an empty panel.
  const active =
    (tab === "setup" && !showSetup) || (tab === "offboarding" && !showOffboarding) ? "manage" : tab;

  return (
    <Tabs value={active} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      {/* Text-only triggers: three icon+label pairs don't fit the rail's width
          at German label lengths, and the bar would scroll sideways. The right
          padding keeps the last one clear of the dialog's close button. */}
      <div className="border-b border-border/70 py-2.5 pl-3 pr-12">
        <TabsList className="h-9 w-full justify-start">
          <TabsTrigger value="manage" className="px-3">
            {t("manageTab")}
          </TabsTrigger>
          {showSetup && (
            <TabsTrigger value="setup" className="gap-1.5 px-3">
              {t("setupTab")}
              <span className="rounded-full bg-warning/15 px-1.5 text-[11px] font-semibold tabular-nums text-warning">
                {outstanding}
              </span>
            </TabsTrigger>
          )}
          {showOffboarding && (
            <TabsTrigger value="offboarding" className="px-3">
              {t("offboardingTab")}
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <TabsContent value="manage" className="mt-0 space-y-4">
          <AdminControls user={user} isAdmin={isAdmin} onClose={onClose} />
          {!showOffboarding && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                setOffboardingOpened(true);
                setTab("offboarding");
              }}
            >
              <LogOut />
              {t("startOffboarding")}
            </Button>
          )}
        </TabsContent>
        {showSetup && (
          <TabsContent value="setup" className="mt-0">
            <StarterChecklist steps={steps} />
          </TabsContent>
        )}
        {showOffboarding && (
          <TabsContent value="offboarding" className="mt-0">
            <OffboardingChecklist user={user} checklist={checklist} />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}

/**
 * Managers+ only editor for `hireDate` — drives the overview's work
 * anniversary shoutouts. Not sensitive like `dateOfBirth`, so no visibility
 * toggle is needed; it's just Manager+-only to *set*.
 */
function HireDateEditor({ userId, hireDate }: { userId: Id<"users">; hireDate: string | null }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const setHireDate = useMutation(api.users.setHireDate);
  const handleError = useErrorHandler();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(hireDate ?? "");

  function save() {
    setHireDate({ userId, hireDate: value || undefined })
      .then(() => toast.success(tc("save")))
      .catch(handleError);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(hireDate ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <CalendarClock className="size-3.5" />
          {hireDate ? formatIsoDate(hireDate, locale) : t("hireDateUnset")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="end">
        <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue("");
              setHireDate({ userId, hireDate: undefined })
                .then(() => toast.success(tc("save")))
                .catch(handleError);
              setOpen(false);
            }}
          >
            {tc("clear")}
          </Button>
          <Button size="sm" onClick={save}>
            {tc("save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The role badge doubles as an admin-only editor for the cosmetic per-user
 * `roleLabel` override (e.g. rendering "Geschäftsführerin" for an admin whose
 * permissions stay exactly admin — this never touches `role` itself).
 */
function RoleBadge({
  member,
  isAdmin,
  tRoles,
  onSave,
  className,
}: {
  member: { role: Role; roleLabel?: string | null };
  isAdmin: boolean;
  tRoles: (role: string) => string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(member.roleLabel ?? "");

  if (!isAdmin) {
    return (
      <Badge variant="muted" className={className}>
        {roleLabel(member, tRoles)}
      </Badge>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(member.roleLabel ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button">
          <Badge variant="muted" className={cn("cursor-pointer", className)}>
            {roleLabel(member, tRoles)}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="start">
        <p className="text-xs font-medium text-muted-foreground">{t("roleLabelHint")}</p>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={tRoles(member.role)}
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue("");
              onSave("");
              setOpen(false);
            }}
          >
            {t("roleLabelReset")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(value);
              setOpen(false);
            }}
          >
            {tc("save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProfileContent({ user, onClose }: { user: ProfileUser; onClose: () => void }) {
  const t = useTranslations("Profile");
  const tRoles = useTranslations("Roles");
  const tAdmin = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  const isAdmin = useIsAdmin();
  const isManager = useIsManager();
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const setRoleLabelMutation = useMutation(api.users.setRoleLabel);
  const handleError = useErrorHandler();
  const now = useNow();

  const isSelf = user._id === me._id;

  async function message() {
    try {
      const { conversationId } = await getOrCreateDm({ otherUserId: user._id });
      router.push(`/chat?c=${conversationId}`);
      onClose();
    } catch (e) {
      handleError(e);
    }
  }

  function copyEmail() {
    void navigator.clipboard.writeText(user.email);
    toast.success(tAdmin("emailCopied"));
  }

  function saveRoleLabel(value: string) {
    setRoleLabelMutation({
      userId: user._id,
      roleLabel: value.trim() || undefined,
    })
      .then(() => toast.success(tAdmin("roleLabelSaved")))
      .catch(handleError);
  }

  const canManage = !isSelf && isManager;
  const online = Boolean(user.lastActiveAt && now - user.lastActiveAt < ONLINE_WINDOW_MS);
  // Birthdays are opt-in; a manager viewing someone's profile doesn't override
  // the person's own "don't show this" choice.
  const showBirthday = Boolean(user.dateOfBirth && (user.showBirthdayPublicly || isSelf));
  const subtitle = [user.jobTitle, user.department].filter(Boolean).join(" · ");

  const identity = (
    <header>
      {/* The person's gradient/colour as a banner the avatar breaks out of,
          instead of a coloured slab with the name written on top of it — the
          identity copy reads on the card surface, at full contrast, whatever
          colour was picked. */}
      <div
        className={cn("h-28", profileGradientClass(user.profileGradient))}
        style={profileColorStyle(user.profileColor)}
      />
      <div className="relative -mt-10 px-5">
        <div className="flex items-end justify-between gap-3">
          <div className="relative shrink-0">
            <Avatar className="size-20 ring-4 ring-card">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            {online && (
              <span
                title={t("online")}
                className="absolute bottom-0.5 right-0.5 size-4 rounded-full border-[3px] border-card bg-success"
              />
            )}
          </div>
          {!isSelf && (
            <Button className="mb-1" onClick={() => void message()}>
              <MessageSquare /> {t("message")}
            </Button>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <h2 className="truncate font-display text-xl font-bold tracking-tight">{user.name}</h2>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RoleBadge member={user} isAdmin={isAdmin} tRoles={tRoles} onSave={saveRoleLabel} />
            {user.status === "suspended" && (
              <Badge variant="destructive">{tAdmin("suspended")}</Badge>
            )}
            {user.external && <Badge variant="warning">{tAdmin("external")}</Badge>}
          </div>
        </div>
      </div>
    </header>
  );

  const details = (
    <InfoPanel>
      <Section label={t("contact")}>
        <div className="space-y-1">
          <ContactRow
            icon={<Mail className="size-4" />}
            value={user.email}
            href={`mailto:${user.email}`}
            onCopy={copyEmail}
          />
          {user.phone && (
            <ContactRow
              icon={<Phone className="size-4" />}
              value={user.phone}
              href={`tel:${user.phone.replace(/\s+/g, "")}`}
            />
          )}
          {user.department && (
            <ContactRow icon={<Building2 className="size-4" />} value={user.department} />
          )}
        </div>
      </Section>

      {(user.hireDate || showBirthday) && (
        <Section label={t("details")}>
          <div className="space-y-1.5">
            {user.hireDate && (
              <DetailRow
                icon={<CalendarDays className="size-4" />}
                label={t("memberSince")}
                value={formatIsoDate(user.hireDate, locale)}
              />
            )}
            {showBirthday && user.dateOfBirth && (
              <DetailRow
                icon={<Cake className="size-4" />}
                label={t("birthday")}
                value={formatIsoDate(user.dateOfBirth, locale)}
              />
            )}
          </div>
        </Section>
      )}

      {user.teams.length > 0 && (
        <Section label={tAdmin("teams")}>
          <div className="flex flex-wrap gap-1">
            {user.teams.map((team) => (
              <Badge key={team} variant="muted" className="gap-1.5">
                <span className={cn("size-1.5 rounded-full", teamColor(team))} />
                {tTeams(teamLabelKey(team))}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      <Organisation userId={user._id} />
      <UpcomingAbsences userId={user._id} />
      {!isSelf && <MutualConversations userId={user._id} onNavigate={onClose} />}
    </InfoPanel>
  );

  const card = (
    <section className="min-w-0">
      {identity}
      <div className="p-5">{details}</div>
    </section>
  );

  if (!canManage) {
    return <div className="h-full min-h-0 overflow-y-auto">{card}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{card}</div>
      <aside className="shrink-0 border-t border-border/70 bg-panel-2/30 lg:flex lg:min-h-0 lg:w-[23rem] lg:flex-col lg:border-l lg:border-t-0">
        <ManagementRail user={user} isAdmin={isAdmin} onClose={onClose} />
      </aside>
    </div>
  );
}

export interface UserProfileProps {
  userId: Id<"users"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A reusable, Discord-style member profile. Everyone sees the standard card
 * (avatar, contact details, mutual chats, upcoming time off); admins also get
 * the management controls (role, teams, suspend, remove, re-invite). It renders
 * as a bottom drawer on mobile and a centred dialog on desktop, so the same
 * component can be opened from the directory, chat, the admin members list, and
 * anywhere else a person is shown.
 */
export function UserProfile({ userId, open, onOpenChange }: UserProfileProps) {
  const t = useTranslations("Profile");
  const isMobile = useIsMobile();
  const me = useCurrentUser();
  const isManager = useIsManager();
  const user = useUser(userId);

  const close = () => onOpenChange(false);
  const title = user?.name ?? t("title");
  const canManage = !!user && user._id !== me._id && isManager;

  const body = user ? (
    <ProfileContent user={user} onClose={close} />
  ) : (
    <div className="p-10 text-center text-sm text-muted-foreground">
      {user === null ? t("notFound") : ""}
    </div>
  );

  // Mobile: a vaul bottom-sheet that can be dragged to dismiss and animates
  // open/closed. Drag-to-dismiss, snap-back, Escape, backdrop click, and body
  // scroll lock are all handled by vaul internally.
  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            {/* Visual drag handle — vaul makes the whole Content draggable */}
            <div className="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-3 active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[85dvh] gap-0 overflow-hidden p-0",
          // The dialog's own close button lands on the colour banner at every
          // width except the two-column one, where it lands on the management
          // rail instead — a translucent chip reads on both.
          "[&_[data-slot=dialog-close]]:bg-black/25 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:backdrop-blur-sm [&_[data-slot=dialog-close]]:hover:bg-black/45",
          // Two columns now instead of three, so the dialog no longer needs to
          // span the whole screen to fit them.
          canManage ? "h-[85dvh] max-h-[44rem] max-w-4xl" : "max-w-md",
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
