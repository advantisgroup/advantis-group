"use client";

import { useState, type ReactNode } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  Cake,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  Copy,
  Crown,
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
import {
  useCurrentUser,
  useHasCapability,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

/** "Ask me about" — topics colleagues can come to this person with. Editable
 * inline on your own profile. */
function Expertise({ tags, isSelf }: { tags: string[]; isSelf: boolean }) {
  const t = useTranslations("Profile");
  const setExpertise = useMutation(api.people.users.setExpertise);
  const handleError = useErrorHandler();
  const [draft, setDraft] = useState("");

  if (!isSelf && tags.length === 0) return null;

  function save(next: string[]) {
    setExpertise({ tags: next }).catch(handleError);
  }

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("expertiseTitle")}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs"
          >
            {tag}
            {isSelf && (
              <button
                type="button"
                aria-label={t("expertiseRemove", { tag })}
                onClick={() => save(tags.filter((other) => other !== tag))}
                className="-mr-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {isSelf && tags.length < 12 && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              save([...tags, draft.trim()]);
              setDraft("");
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("expertiseAdd")}
              maxLength={32}
              className="h-7 w-36 rounded-full px-2.5 text-xs"
            />
          </form>
        )}
      </div>
    </div>
  );
}

/** Sections that load on their own fade in rather than snapping into place. */
const LATE_SECTION = "animate-in fade-in-0 duration-300";

function useUser(userId: Id<"users"> | null) {
  return useQuery(api.people.users.get, userId ? { userId } : "skip");
}

/** A small labelled section so the profile reads like a tidy info card. */
function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The single body card every profile detail lives in — one inset panel with
 * hairline-separated `Section`s. Rows inside a section are plain lines, not
 * more bordered boxes: a box in a box in a card is what made this feel
 * cramped. Several sections render `null` when empty, which the divider
 * handles for free.
 */
function InfoPanel({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-panel-2/40 [&>*]:px-4 [&>*]:py-4">
      {children}
    </div>
  );
}

/** Every detail row leads with the same tile, so rows line up whatever follows. */
function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
      {children}
    </span>
  );
}

/** A labelled control in the management rail — label over control, so the
 *  control gets the rail's full width rather than whatever the label leaves. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** One `label: value` line in the profile's details section. */
function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-center gap-3 text-sm">
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** A single contact line: icon, a mailto:/tel: link, and a copy button. */
function ContactRow({
  icon,
  value,
  href,
  onCopy,
}: {
  icon: ReactNode;
  value: string;
  href: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 text-sm">
      <IconTile>{icon}</IconTile>
      <a href={href} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">
        {value}
      </a>
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={onCopy}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

function PersonRow({
  person,
}: {
  person: { name: string; jobTitle: string | null; avatar: string | null };
}) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <Avatar className="size-8 shrink-0">
        {person.avatar && <AvatarImage src={person.avatar} alt={person.name} />}
        <AvatarFallback className="text-[10px]">{initials(person.name, "")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        {person.jobTitle && (
          <p className="truncate text-xs text-muted-foreground">{person.jobTitle}</p>
        )}
      </div>
    </div>
  );
}

function TeamsEditor({ userId, teams }: { userId: Id<"users">; teams: string[] }) {
  const t = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const setTeams = useMutation(api.people.users.setTeams);
  const handleError = useErrorHandler();

  function toggle(id: string) {
    const next = teams.includes(id) ? teams.filter((x) => x !== id) : [...teams, id];
    setTeams({ userId, teams: next }).catch(handleError);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 w-full justify-start">
          <Users2 className="size-3.5" />
          <span className="truncate">
            {teams.length > 0 ? teams.map((id) => tTeams(teamLabelKey(id))).join(", ") : t("teams")}
          </span>
          {teams.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1">
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

/** How recent a presence heartbeat still counts as "online". */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const NOBODY = "nobody";

/** People who manage members place someone in a department; admins can also
 *  pick someone by hand that they report to, on top of their team and
 *  department leads. */
function OrganisationEditor({
  userId,
  departmentId,
  manualManagerId,
}: {
  userId: Id<"users">;
  departmentId: Id<"departments"> | null;
  manualManagerId: Id<"users"> | null;
}) {
  const t = useTranslations("Profile");
  const handleError = useErrorHandler();
  const isAdmin = useIsAdmin();
  const setManager = useMutation(api.people.users.setManager);
  const setDepartment = useMutation(api.org.structure.setUserDepartment);
  const departments = useQuery(api.org.structure.listDepartments, {});
  const users = useQuery(api.people.users.list, isAdmin ? {} : "skip");

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("departmentTitle")}</p>
        <Select
          value={departmentId ?? NOBODY}
          onValueChange={(value) =>
            setDepartment({
              userId,
              departmentId: value === NOBODY ? null : (value as Id<"departments">),
            })
              .then(() => toast.success(t("organisationSaved")))
              .catch(handleError)
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOBODY}>{t("departmentNone")}</SelectItem>
            {(departments ?? []).map((department) => (
              <SelectItem key={department._id} value={department._id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isAdmin && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("reportsToManual")}</p>
          <Select
            value={manualManagerId ?? NOBODY}
            onValueChange={(value) =>
              setManager({
                userId,
                managerId: value === NOBODY ? undefined : (value as Id<"users">),
              })
                .then(() => toast.success(t("organisationSaved")))
                .catch(handleError)
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>{t("reportsToNobody")}</SelectItem>
              {(users ?? [])
                .filter((u) => u._id !== userId)
                .map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("organisationHint")}</p>
    </div>
  );
}

function Organisation({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Profile");
  const canEdit = useHasCapability("manage_members");
  const org = useQuery(api.people.users.orgContext, { userId });
  if (!org || (!canEdit && org.lines.length === 0 && org.reports.length === 0)) return null;

  return (
    <Section label={t("organisation")} className={LATE_SECTION}>
      <div className="space-y-3">
        {org.lines.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("reportsToTitle")}</p>
            <div className="space-y-1">
              {org.lines.map((line) => (
                <PersonRow
                  key={line.person._id}
                  person={{
                    ...line.person,
                    jobTitle:
                      line.via === "manual"
                        ? t("lineManual")
                        : t(line.via === "team" ? "lineTeam" : "lineDepartment", {
                            name: line.label ?? "",
                          }),
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {canEdit && (
          <OrganisationEditor
            userId={userId}
            departmentId={org.departmentId}
            manualManagerId={org.manualManagerId}
          />
        )}
        {org.reports.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("reports", { count: org.reports.length })}
            </p>
            <div className="space-y-1">
              {org.reports.map((p) => (
                <PersonRow key={p._id} person={p} />
              ))}
            </div>
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
    <Section label={t("mutual")} className={LATE_SECTION}>
      <div className="-mx-2 space-y-0.5">
        {mutual.map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => {
              router.push(`/chat?c=${c._id}`);
              onNavigate();
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
          >
            {c.type === "dm" ? (
              <Avatar className="size-8 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
                <AvatarFallback className="text-[10px]">{initials(c.title, "")}</AvatarFallback>
              </Avatar>
            ) : (
              <IconTile>
                <Hash />
              </IconTile>
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
    <Section label={t("upcoming")} className={LATE_SECTION}>
      <div className="space-y-1">
        {absences.map((a) => {
          const range =
            a.startDate === a.endDate
              ? formatIsoDate(a.startDate, locale)
              : `${formatIsoDate(a.startDate, locale)} – ${formatIsoDate(a.endDate, locale)}`;
          return (
            <div key={a.id} className="flex min-h-10 items-center gap-3 text-sm">
              <IconTile>
                <CalendarClock />
              </IconTile>
              <span className="min-w-0 flex-1 truncate font-medium">{tAbs(a.type)}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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

function ProgressBar({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", className)}
        style={{ width: `${total ? (value / total) * 100 : 0}%` }}
      />
    </div>
  );
}

function StarterChecklist({ steps }: { steps: StarterStep[] }) {
  const t = useTranslations("Profile");
  const completed = steps.filter((step) => step.complete).length;

  return (
    <Section label={t("starterChecklist")}>
      <p className="text-xs text-muted-foreground">
        {t("starterChecklistProgress", { completed, total: steps.length })}
      </p>
      <ProgressBar value={completed} total={steps.length} className="bg-success" />
      <ul className="mt-4 space-y-1">
        {steps.map((step) => {
          const Icon = step.complete ? CheckCircle2 : Circle;
          return (
            <li
              key={step.key}
              className={cn(
                "flex min-h-8 items-center gap-2.5 text-sm",
                step.complete ? "text-muted-foreground" : "font-medium",
              )}
            >
              <Icon className={cn("size-4 shrink-0", step.complete && "text-success")} />
              <span>{t(`starterChecklist_${step.key}`)}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

type OffboardingRecord = FunctionReturnType<typeof api.org.offboarding.get>;

function OffboardingChecklist({
  user,
  checklist,
}: {
  user: ProfileUser;
  /** `undefined` while the query is still loading, `null` when none exists. */
  checklist: OffboardingRecord | undefined;
}) {
  const t = useTranslations("Profile");
  const setLastWorkingDay = useMutation(api.org.offboarding.setLastWorkingDay);
  const setStep = useMutation(api.org.offboarding.setStep);
  const handleError = useErrorHandler();
  const steps = ["handover", "tickets", "guidebooks", "files", "devices", "access"] as const;
  const completed = checklist?.completedSteps.length ?? 0;

  return (
    <Section label={t("offboardingChecklist")}>
      <p className="text-xs text-muted-foreground">
        {t("offboardingChecklistProgress", { completed, total: steps.length })}
      </p>
      <ProgressBar value={completed} total={steps.length} className="bg-primary" />
      <label className="mt-4 block text-xs font-medium text-muted-foreground">
        {t("offboardingLastWorkingDay")}
        <Input
          key={checklist?._id ?? "new"}
          type="date"
          defaultValue={checklist?.lastWorkingDay ?? ""}
          className="mt-1.5 h-9"
          onBlur={(event) =>
            void setLastWorkingDay({
              userId: user._id,
              lastWorkingDay: event.target.value || undefined,
            }).catch(handleError)
          }
        />
      </label>
      <div className="mt-4 space-y-1">
        {steps.map((step) => {
          const complete = checklist?.completedSteps.includes(step) ?? false;
          return (
            <label key={step} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={complete}
                onCheckedChange={(checked) =>
                  void setStep({
                    userId: user._id,
                    step,
                    complete: checked === true,
                  }).catch(handleError)
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

/** A settings-style list: one bordered group, rows split by hairlines. */
function ActionGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
      {children}
    </div>
  );
}

/** One action in an `ActionGroup`. Wraps instead of truncating — German labels
 *  ("Geschäftsführungs-Zugriff gewähren") run 2-3x longer than English ones. */
function ActionRow({
  icon,
  children,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive ? "text-destructive" : "[&_svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Read-only: where this person is linked and what each area has granted
 * them. Granting itself still happens in each area's own admin page. */
function LinkedAccountsSection({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Admin");
  const links = useQuery(api.security.accountLinks.forUser, { userId });
  if (!links) return null;

  const { performance, applicant, academies } = links;
  const performanceValue =
    performance.status === "linked"
      ? [
          performance.isSuperAdmin
            ? t("linkedAccountsSuperAdmin")
            : (performance.roleName ?? t("linkedAccountsNoRole")),
          performance.autoLinked ? t("linkedAccountsAuto") : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
  const applicantValue =
    applicant.status === "granted"
      ? [
          applicant.isDelegate ? t("linkedAccountsDelegate") : t("linkedAccountsGranted"),
          applicant.hasPasskey
            ? t("linkedAccountsPasskey")
            : applicant.vaultPasswordSet
              ? t("linkedAccountsPassword")
              : t("linkedAccountsNoVaultSetup"),
        ].join(" · ")
      : null;

  const rows = [
    {
      label: t("linkedAccountsPerformance"),
      value: performanceValue,
      empty: t("linkedAccountsNotLinked"),
    },
    {
      label: t("linkedAccountsHr"),
      value: applicantValue,
      empty: t("linkedAccountsNoAccess"),
    },
    ...(academies.length > 0
      ? [
          {
            label: t("linkedAccountsAcademy"),
            value: academies
              .map((a) =>
                a.autoLinked
                  ? `${humanizeSlug(a.academyId)} (${t("linkedAccountsAuto").toLowerCase()})`
                  : humanizeSlug(a.academyId),
              )
              .join(", "),
            empty: "",
          },
        ]
      : []),
  ];

  return (
    <Section label={t("linkedAccounts")}>
      <dl className="space-y-2 text-[13px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "min-w-0 text-right text-pretty",
                !row.value && "text-muted-foreground",
              )}
            >
              {row.value ?? row.empty}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
function AdminControls({
  user,
  isAdmin,
  onClose,
  onStartOffboarding,
}: {
  user: ProfileUser;
  isAdmin: boolean;
  onClose: () => void;
  onStartOffboarding?: () => void;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tProfile = useTranslations("Profile");
  const tRoles = useTranslations("Roles");
  const tCustomRoles = useTranslations("CustomRoles");
  const tApplicants = useTranslations("Applicants");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const setRole = useMutation(api.people.users.setRole);
  const setStatus = useMutation(api.people.users.setStatus);
  const removeMember = useMutation(api.people.members.remove);
  const reinvite = useAction(api.people.members.reinvite);
  const setUploadPermission = useMutation(api.people.users.setUploadPermission);
  const setGfAccess = useMutation(api.people.users.setGfAccess);
  const setApplicantDelegate = useMutation(api.people.users.setApplicantDelegate);
  const setManagingDirector = useMutation(api.people.users.setManagingDirector);
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
    <div className="space-y-5">
      {(hasCustomRoles || hasNamedPermissions) && (
        <Section label={t("permissions")}>
          <div className="flex flex-wrap gap-1.5">
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
        </Section>
      )}

      {isAdmin && <LinkedAccountsSection userId={user._id} />}

      {/* Label above control, not beside it: the rail is a single narrow
          column, and a `justify-between` row left the role picker (three
          German role names) no width to live in. */}
      <div className="space-y-4">
        {isAdmin && !isSelf && (
          <SettingRow label={t("role")}>
            <RoleSelect value={user.role} onChange={changeRole} canElevate />
          </SettingRow>
        )}
        {isAdmin && (
          <SettingRow label={t("teams")}>
            <TeamsEditor userId={user._id} teams={user.teams} />
          </SettingRow>
        )}
        {!isSelf && (
          <SettingRow label={t("hireDate")}>
            <HireDateEditor userId={user._id} hireDate={user.hireDate} />
          </SettingRow>
        )}
      </div>

      {/* Permission grants and lifecycle actions only make sense on someone
          else's account. The risky two (suspend, remove) get their own group
          so they never sit flush against an everyday toggle. */}
      {!isSelf && (
        <div className="space-y-3">
          <ActionGroup>
            <ActionRow icon={<UploadCloud />} onClick={toggleUploads}>
              {user.uploadRequestsEnabled ? t("disableUploads") : t("enableUploads")}
            </ActionRow>
            {isAdmin && (
              <ActionRow icon={<Lock />} onClick={toggleGf}>
                {user.gfAccess ? t("revokeGf") : t("grantGf")}
              </ActionRow>
            )}
            {isAdmin && (
              <ActionRow icon={<Users2 />} onClick={() => void toggleApplicantDelegate()}>
                {user.applicantAccessDelegate
                  ? t("revokeApplicantDelegate")
                  : t("grantApplicantDelegate")}
              </ActionRow>
            )}
            {isAdmin && (
              <ActionRow
                icon={<Crown />}
                onClick={() =>
                  setManagingDirector({
                    userId: user._id,
                    managingDirector: !user.managingDirector,
                  })
                    .then(() => toast.success(tProfile("organisationSaved")))
                    .catch(handleError)
                }
              >
                {user.managingDirector
                  ? tProfile("managingDirectorRemove")
                  : tProfile("managingDirectorMake")}
              </ActionRow>
            )}
            {isAdmin && (
              <ActionRow icon={<Send />} onClick={onReinvite}>
                {t("reinvite")}
              </ActionRow>
            )}
            {onStartOffboarding && (
              <ActionRow icon={<LogOut />} onClick={onStartOffboarding}>
                {tProfile("startOffboarding")}
              </ActionRow>
            )}
          </ActionGroup>
          {isAdmin && !isTargetAdmin && (
            <ActionGroup>
              <ActionRow icon={<ShieldCheck />} onClick={() => void toggleStatus()}>
                {isActive ? t("suspend") : t("activate")}
              </ActionRow>
              <ActionRow icon={<UserMinus />} onClick={() => void onRemove()} destructive>
                {t("removeMember")}
              </ActionRow>
            </ActionGroup>
          )}
        </div>
      )}
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
  const checklist = useQuery(api.org.offboarding.get, { userId: user._id });
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
          at German label lengths. The extra right padding on desktop keeps the
          last one clear of the dialog's close button, which sits over the
          rail once it's a column of its own. */}
      <div className="border-b border-border/70 px-3 py-2.5 lg:pr-12">
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
      <div className="p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <TabsContent value="manage" className="mt-0">
          <AdminControls
            user={user}
            isAdmin={isAdmin}
            onClose={onClose}
            onStartOffboarding={
              showOffboarding
                ? undefined
                : () => {
                    setOffboardingOpened(true);
                    setTab("offboarding");
                  }
            }
          />
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
  const setHireDate = useMutation(api.people.users.setHireDate);
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
        <Button size="sm" variant="outline" className="h-9 w-full justify-start">
          <CalendarClock className="size-3.5" />
          <span className={cn("truncate", !hireDate && "text-muted-foreground")}>
            {hireDate ? formatIsoDate(hireDate, locale) : t("hireDateUnset")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
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
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge variant="muted" className={cn("cursor-pointer", className)}>
            {roleLabel(member, tRoles)}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
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
  const setRoleLabelMutation = useMutation(api.people.users.setRoleLabel);
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

  function copy(value: string, confirmation: string) {
    void navigator.clipboard.writeText(value);
    toast.success(confirmation);
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
        className={cn("h-24 sm:h-28", profileGradientClass(user.profileGradient))}
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
            <Button className="mb-1 shrink-0" onClick={() => void message()}>
              <MessageSquare /> {t("message")}
            </Button>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <h2 className="break-words font-display text-xl font-bold leading-tight tracking-tight text-balance">
            {user.name}
          </h2>
          {subtitle && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <RoleBadge member={user} isAdmin={isAdmin} tRoles={tRoles} onSave={saveRoleLabel} />
            {user.status === "suspended" && (
              <Badge variant="destructive">{tAdmin("suspended")}</Badge>
            )}
            {user.external && <Badge variant="warning">{tAdmin("external")}</Badge>}
            {user.managingDirector && <Badge variant="muted">{t("managingDirector")}</Badge>}
          </div>
          <Expertise tags={user.expertise} isSelf={isSelf} />
        </div>
      </div>
    </header>
  );

  const details = (
    <InfoPanel>
      {/* Department already sits under the name, so it isn't repeated here. */}
      <Section label={t("contact")}>
        <div className="space-y-1">
          <ContactRow
            icon={<Mail />}
            value={user.email}
            href={`mailto:${user.email}`}
            onCopy={() => copy(user.email, tAdmin("emailCopied"))}
          />
          {user.phone && (
            <ContactRow
              icon={<Phone />}
              value={user.phone}
              href={`tel:${user.phone.replace(/\s+/g, "")}`}
              onCopy={() => copy(user.phone ?? "", t("phoneCopied"))}
            />
          )}
        </div>
      </Section>

      {(user.hireDate || showBirthday) && (
        <Section label={t("details")}>
          <div className="space-y-1">
            {user.hireDate && (
              <DetailRow
                icon={<CalendarDays />}
                label={t("memberSince")}
                value={formatIsoDate(user.hireDate, locale)}
              />
            )}
            {showBirthday && user.dateOfBirth && (
              <DetailRow
                icon={<Cake />}
                label={t("birthday")}
                value={formatIsoDate(user.dateOfBirth, locale)}
              />
            )}
          </div>
        </Section>
      )}

      {user.teams.length > 0 && (
        <Section label={tAdmin("teams")}>
          <div className="flex flex-wrap gap-1.5">
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
    <section className="min-w-0 pb-5">
      {identity}
      <div className="px-5 pt-5">{details}</div>
    </section>
  );

  // `min-h-0 flex-1` rather than `h-full`: the dialog and the sheet only cap
  // their height, so a percentage height never resolves and a long profile
  // got clipped instead of scrolling.
  if (!canManage) {
    return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{card}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:flex-row lg:overflow-hidden">
      <div className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{card}</div>
      {/* 25rem, not less: the role picker's three German labels are the widest
          thing in the rail and this is what fits them on one line. */}
      <aside className="shrink-0 border-t border-border/70 bg-panel-2/30 lg:flex lg:min-h-0 lg:w-[25rem] lg:flex-col lg:border-l lg:border-t-0">
        <ManagementRail user={user} isAdmin={isAdmin} onClose={onClose} />
      </aside>
    </div>
  );
}

/** Stands in for the identity header while the profile loads, so the dialog
 *  never opens as an empty box. */
function ProfileSkeleton() {
  return (
    <div aria-hidden className="pb-5">
      <Skeleton className="h-24 rounded-none sm:h-28" />
      <div className="-mt-10 px-5">
        <Skeleton className="size-20 rounded-full ring-4 ring-card" />
        <Skeleton className="mt-3 h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="px-5 pt-5">
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
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
  ) : user === null ? (
    <p className="px-6 pb-10 pt-12 text-center text-sm text-muted-foreground">{t("notFound")}</p>
  ) : (
    <ProfileSkeleton />
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
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card text-card-foreground shadow-2xl shadow-black/40 outline-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            {/* Over the banner rather than above it, so the colour runs all the
                way to the sheet's rounded top edge. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-white/70 ring-1 ring-black/10" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
              {body}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0",
          // The dialog's own close button lands on the colour banner at every
          // width except the two-column one, where it lands on the management
          // rail instead — a translucent chip reads on both.
          "[&_[data-slot=dialog-close]]:bg-black/25 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:backdrop-blur-sm [&_[data-slot=dialog-close]]:hover:bg-black/45",
          canManage ? "h-[85dvh] max-h-[44rem] max-w-4xl" : "max-w-md",
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
