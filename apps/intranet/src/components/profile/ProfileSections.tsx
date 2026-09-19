"use client";

import { useHasCapability, useIsAdmin } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { addDaysIso, isoToday } from "@/lib/absences";
import { useAbsencesCalendar } from "@/lib/absences-api";
import { formatIsoDate, initials } from "@/lib/format";
import { TEAMS, teamColor, teamLabelKey } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { CalendarClock, CheckCircle2, Circle, Hash, Users2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { IconTile, PersonRow, ProgressBar, Section, type useUser } from "./ProfileParts";

export type ProfileUser = NonNullable<ReturnType<typeof useUser>>;

/** "Ask me about" — topics colleagues can come to this person with. Editable
 * inline on your own profile. */
export function Expertise({ tags, isSelf }: { tags: string[]; isSelf: boolean }) {
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

export function TeamsEditor({ userId, teams }: { userId: Id<"users">; teams: string[] }) {
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

export function Organisation({ userId }: { userId: Id<"users"> }) {
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
export function MutualConversations({
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

export function UpcomingAbsences({ userId }: { userId: Id<"users"> }) {
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

export type StarterStep = { key: string; complete: boolean };

export function StarterChecklist({ steps }: { steps: StarterStep[] }) {
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

export function OffboardingChecklist({
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

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Read-only: where this person is linked and what each area has granted
 * them. Granting itself still happens in each area's own admin page. */
export function LinkedAccountsSection({ userId }: { userId: Id<"users"> }) {
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
