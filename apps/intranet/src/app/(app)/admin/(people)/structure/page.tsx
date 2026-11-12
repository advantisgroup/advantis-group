"use client";

import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  Archive,
  Building2,
  ChevronRight,
  ChevronsUpDown,
  Crown,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  UserCheck,
  UserRound,
  Users2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonAvatar, PersonPicker, type PersonOption } from "@/components/people/PersonPicker";
import { useIsAdmin } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

type Overview = FunctionReturnType<typeof api.org.structure.overview>;
type Department = Overview["departments"][number];
type Team = Overview["teams"][number];
type Person = PersonOption;

const NONE = "__none";

/**
 * Departments with their teams underneath, so the org reads the way people
 * think about it. Leads, renaming, moving a team and archiving all happen in
 * place; archived entries wait in a closed list at the bottom.
 */
export default function StructurePage() {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();
  const data = useQuery(api.org.structure.overview, isAdmin ? {} : "skip");
  const people = useQuery(api.people.users.options, isAdmin ? {} : "skip");
  const [creating, setCreating] = useState<{
    kind: "department" | "team";
    departmentId?: string;
  }>();

  const actions = useMemo(
    () => [
      {
        key: "team",
        label: t("structure.newTeam"),
        icon: Users2,
        variant: "outline" as const,
        onClick: () => setCreating({ kind: "team" }),
      },
      {
        key: "new",
        label: t("structure.newDepartment"),
        icon: Plus,
        onClick: () => setCreating({ kind: "department" }),
      },
    ],
    [t],
  );

  if (!isAdmin) return <ForbiddenScreen />;

  const departments = data?.departments.filter((d) => d.archivedAt === undefined) ?? [];
  const activeIds = new Set(departments.map((d) => d._id as string));
  const teams = data?.teams.filter((team) => team.archivedAt === undefined) ?? [];
  // a team whose department was archived is as good as unplaced
  const unplaced = teams.filter((team) => !team.departmentId || !activeIds.has(team.departmentId));
  const archived = [
    ...(data?.departments ?? []).filter((d) => d.archivedAt !== undefined),
    ...(data?.teams ?? []).filter((team) => team.archivedAt !== undefined),
  ];
  const leads = people ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <PageHeaderBar
        title={t("structure.title")}
        description={t("structure.description")}
        icon={<Building2 />}
      />
      <PageHeaderActions actions={actions} />

      <HowItWorks />

      {data === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : departments.length === 0 && teams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium">{t("structure.emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t("structure.emptyBody")}
          </p>
          <Button className="mt-5" size="sm" onClick={() => setCreating({ kind: "department" })}>
            <Plus />
            {t("structure.newDepartment")}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {departments.map((department) => (
              <DepartmentCard
                key={department._id}
                department={department}
                teams={teams.filter((team) => team.departmentId === department._id)}
                departments={departments}
                people={leads}
                onAddTeam={() => setCreating({ kind: "team", departmentId: department._id })}
              />
            ))}
          </div>

          {unplaced.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">{t("structure.unplacedTitle")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("structure.unplacedHint")}
                </p>
              </div>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                {unplaced.map((team) => (
                  <TeamRow key={team._id} team={team} departments={departments} people={leads} />
                ))}
              </ul>
            </section>
          )}

          {archived.length > 0 && <ArchivedList entries={archived} />}
        </>
      )}

      {creating && (
        <CreateDialog
          kind={creating.kind}
          initialDepartmentId={creating.departmentId}
          departments={departments}
          onClose={() => setCreating(undefined)}
        />
      )}
    </div>
  );
}

// one colour per kind of thing, shared by the drawing and the legend beside it
const tint = (color: string): CSSProperties => ({
  color,
  background: `color-mix(in oklab, ${color} 14%, transparent)`,
});
const DEPARTMENT = "var(--chart-1)";
const TEAM = "var(--chart-2)";
const LEAD = "var(--chart-3)";
const DIRECTOR = "var(--chart-5)";

function HowItWorks() {
  const t = useTranslations("Admin");
  const legend = [
    { line: "Departments", icon: Building2, color: DEPARTMENT },
    { line: "Teams", icon: Users2, color: TEAM },
    { line: "Leads", icon: UserCheck, color: LEAD },
    { line: "Director", icon: Crown, color: DIRECTOR },
  ] as const;

  return (
    <details className="group rounded-xl border border-border/70 bg-card text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        {t("structure.howItWorks")}
      </summary>
      <div className="grid gap-6 border-t border-border/60 p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:p-5">
        <OrgDiagram />
        <ul className="space-y-3.5">
          {legend.map(({ line, icon: Icon, color }) => (
            <li key={line} className="flex gap-3">
              <span
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg"
                style={tint(color)}
              >
                <Icon className="size-3.5" />
              </span>
              <p className="leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t(`orgEntity.intro${line}Title`)}
                </span>{" "}
                {t(`orgEntity.intro${line}`)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** A worked example of the model: the legend beside it says the same in words. */
function OrgDiagram() {
  const t = useTranslations("Admin");
  const d = (
    key:
      | "director"
      | "directorNote"
      | "sales"
      | "inbound"
      | "outbound"
      | "departmentLead"
      | "teamLead"
      | "member"
      | "reportsTo"
      | "and",
  ) => t(`structure.diagram.${key}`);

  return (
    <div aria-hidden className="rounded-xl bg-muted/40 p-3 text-[13px] sm:p-4">
      {/* dashed: above everyone, but nobody reports to it */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/70 px-3 py-2">
        <Crown className="size-3.5 shrink-0" style={{ color: DIRECTOR }} />
        <span className="font-medium">{d("director")}</span>
        <span className="ml-auto hidden truncate text-xs text-muted-foreground sm:block">
          {d("directorNote")}
        </span>
      </div>
      <div className="ml-6 h-3 border-l border-dashed border-border" />

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="size-4 shrink-0" style={{ color: DEPARTMENT }} />
          <span className="font-semibold">{d("sales")}</span>
          <LeadPill>{d("departmentLead")}</LeadPill>
        </div>
        <div className="ml-[7px] mt-2.5 space-y-2 border-l border-border pl-4">
          <DiagramTeam name={d("inbound")} lead={d("teamLead")} member={d("member")} />
          <DiagramTeam name={d("outbound")} lead={d("teamLead")} member={d("member")} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 px-1 text-xs text-muted-foreground">
        <UserRound className="size-3.5 shrink-0" />
        <span className="font-medium text-foreground">{d("member")}</span>
        <span>{d("reportsTo")}</span>
        <LeadPill>{d("teamLead")}</LeadPill>
        <span>{d("and")}</span>
        <LeadPill>{d("departmentLead")}</LeadPill>
      </div>
    </div>
  );
}

function DiagramTeam({ name, lead, member }: { name: string; lead: string; member: string }) {
  return (
    <div className="relative rounded-md border border-border/80 bg-background/60 px-2.5 py-2 before:absolute before:-left-4 before:top-[18px] before:h-px before:w-4 before:bg-border">
      <div className="flex flex-wrap items-center gap-2">
        <Users2 className="size-3.5 shrink-0" style={{ color: TEAM }} />
        <span className="font-medium">{name}</span>
        <LeadPill>{lead}</LeadPill>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 pl-[22px] text-xs text-muted-foreground">
        <UserRound className="size-3 shrink-0" />
        {member}
      </div>
    </div>
  );
}

function LeadPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full" style={{ background: LEAD }} />
      {children}
    </span>
  );
}

function DepartmentCard({
  department,
  teams,
  departments,
  people,
  onAddTeam,
}: {
  department: Department;
  teams: Team[];
  departments: Department[];
  people: Person[];
  onAddTeam: () => void;
}) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const rename = useMutation(api.org.structure.renameDepartment);
  const archive = useMutation(api.org.structure.archiveDepartment);
  const setLead = useMutation(api.org.structure.setDepartmentReportsTo);
  const [editing, setEditing] = useState(false);
  const departmentId = department._id as Id<"departments">;

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-muted-foreground ring-1 ring-inset ring-border">
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <EditableName
            name={department.name}
            editing={editing}
            onDone={() => setEditing(false)}
            onSave={(name) => rename({ departmentId, name }).catch(handleError)}
            className="text-[15px] font-semibold"
          />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("structure.people", { count: department.memberCount })}
            {" · "}
            {t("structure.teams", { count: teams.length })}
          </p>
        </div>
        <LeadSelect
          value={department.reportsToUserId}
          people={people}
          onChange={(userId) =>
            setLead({ departmentId, userId: userId as Id<"users"> | null }).catch(handleError)
          }
        />
        <RowMenu
          name={department.name}
          onRename={() => setEditing(true)}
          onArchive={() => archive({ departmentId, archived: true }).catch(handleError)}
        />
      </header>

      {teams.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/60 bg-background/40">
          {teams.map((team) => (
            <TeamRow key={team._id} team={team} departments={departments} people={people} nested />
          ))}
        </ul>
      )}

      <div className="border-t border-border/60 px-3 py-1.5">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onAddTeam}>
          <Plus />
          {t("structure.addTeam")}
        </Button>
      </div>
    </section>
  );
}

function TeamRow({
  team,
  departments,
  people,
  nested,
}: {
  team: Team;
  departments: Department[];
  people: Person[];
  nested?: boolean;
}) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const rename = useMutation(api.org.structure.renameTeam);
  const archive = useMutation(api.org.structure.archiveTeam);
  const setLead = useMutation(api.org.structure.setTeamReportsTo);
  const move = useMutation(api.org.structure.setTeamDepartment);
  const [editing, setEditing] = useState(false);
  const teamId = team._id as Id<"teams">;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 pr-5",
        nested ? "pl-5 sm:pl-[4.25rem]" : "pl-5",
      )}
    >
      <Users2 className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <EditableName
          name={team.name}
          editing={editing}
          onDone={() => setEditing(false)}
          onSave={(name) => rename({ teamId, name }).catch(handleError)}
          className="text-sm font-medium"
        />
        {!editing && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("structure.people", { count: team.memberCount })}
          </span>
        )}
      </div>
      <LeadSelect
        value={team.reportsToUserId}
        people={people}
        onChange={(userId) =>
          setLead({ teamId, userId: userId as Id<"users"> | null }).catch(handleError)
        }
      />
      <RowMenu
        name={team.name}
        onRename={() => setEditing(true)}
        onArchive={() => archive({ teamId, archived: true }).catch(handleError)}
        move={{
          current: team.departmentId,
          departments,
          onMove: (departmentId) =>
            move({ teamId, departmentId: departmentId as Id<"departments"> | null }).catch(
              handleError,
            ),
        }}
      />
    </li>
  );
}

function EditableName({
  name,
  editing,
  onDone,
  onSave,
  className,
}: {
  name: string;
  editing: boolean;
  onDone: () => void;
  onSave: (name: string) => void;
  className?: string;
}) {
  if (!editing) return <span className={cn("block truncate", className)}>{name}</span>;

  const commit = (value: string) => {
    if (value.trim() && value.trim() !== name) onSave(value.trim());
    onDone();
  };

  return (
    <Input
      autoFocus
      defaultValue={name}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        if (e.key === "Escape") onDone();
      }}
      className="h-8 max-w-xs"
    />
  );
}

function LeadSelect({
  value,
  people,
  onChange,
}: {
  value?: string;
  people: Person[];
  onChange: (userId: string | null) => void;
}) {
  const t = useTranslations("Admin");
  const lead = people.find((person) => person.userId === value);
  return (
    <PersonPicker
      value={(value ?? null) as Id<"users"> | null}
      onChange={(userId) => onChange(userId)}
      people={people}
      label={t("orgEntity.reportsTo")}
      noneLabel={t("orgEntity.reportsToNobody")}
      align="end"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("orgEntity.reportsTo")}
          className={cn("max-w-60 gap-1.5 font-normal", !lead && "text-muted-foreground")}
        >
          {lead && <PersonAvatar person={lead} className="size-5" />}
          <span className="truncate">
            {lead
              ? t("orgEntity.reportsToPerson", { name: lead.name })
              : t("orgEntity.reportsToNobody")}
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      }
    />
  );
}

function RowMenu({
  name,
  onRename,
  onArchive,
  move,
}: {
  name: string;
  onRename: () => void;
  onArchive: () => void;
  move?: {
    current?: string;
    departments: Department[];
    onMove: (departmentId: string | null) => void;
  };
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  // the rename field grabs focus; the menu mustn't take it back when it closes
  const keepFocus = useRef(false);

  async function archive() {
    const ok = await confirm({
      title: t("orgEntity.confirmArchiveTitle", { name }),
      description: t("orgEntity.confirmArchiveBody"),
      confirmLabel: t("orgEntity.archive"),
      cancelLabel: tc("cancel"),
    });
    if (ok) onArchive();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label={t("structure.actions", { name })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(e) => {
          if (keepFocus.current) e.preventDefault();
          keepFocus.current = false;
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            keepFocus.current = true;
            onRename();
          }}
        >
          <Pencil />
          {t("structure.rename")}
        </DropdownMenuItem>
        {move && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput />
              {t("structure.moveTo")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={move.current ?? NONE}
                onValueChange={(v) => move.onMove(v === NONE ? null : v)}
              >
                {move.departments.map((department) => (
                  <DropdownMenuRadioItem key={department._id} value={department._id}>
                    {department.name}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuRadioItem value={NONE}>
                  {t("structure.noDepartment")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => void archive()}
        >
          <Archive />
          {t("orgEntity.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ArchivedList({ entries }: { entries: (Department | Team)[] }) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const restoreDepartment = useMutation(api.org.structure.archiveDepartment);
  const restoreTeam = useMutation(api.org.structure.archiveTeam);

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        {t("structure.archived", { count: entries.length })}
      </summary>
      <ul className="mt-3 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
        {entries.map((entry) => {
          const isTeam = "slug" in entry;
          const Icon = isTeam ? Users2 : Building2;
          return (
            <li key={entry._id} className="flex items-center gap-3 px-5 py-2.5">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {entry.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  (isTeam
                    ? restoreTeam({ teamId: entry._id as Id<"teams">, archived: false })
                    : restoreDepartment({
                        departmentId: entry._id as Id<"departments">,
                        archived: false,
                      })
                  ).catch(handleError)
                }
              >
                {t("orgEntity.restore")}
              </Button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function CreateDialog({
  kind,
  initialDepartmentId,
  departments,
  onClose,
}: {
  kind: "department" | "team";
  initialDepartmentId?: string;
  departments: Department[];
  onClose: () => void;
}) {
  const t = useTranslations("Admin");
  const handleError = useErrorHandler();
  const createDepartment = useMutation(api.org.structure.createDepartment);
  const createTeam = useMutation(api.org.structure.createTeam);
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? NONE);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (kind === "department") {
        await createDepartment({ name: name.trim() });
      } else {
        await createTeam({
          name: name.trim(),
          departmentId: departmentId === NONE ? undefined : (departmentId as Id<"departments">),
        });
      }
      onClose();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={kind === "department" ? t("structure.newDepartment") : t("structure.newTeam")}
      description={
        kind === "department" ? t("structure.newDepartmentHint") : t("structure.newTeamHint")
      }
      footer={
        <Button
          disabled={busy || !name.trim()}
          onClick={() => void create()}
          className="w-full sm:w-auto"
        >
          {t("orgEntity.create")}
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
          placeholder={
            kind === "department"
              ? t("structure.departmentPlaceholder")
              : t("structure.teamPlaceholder")
          }
          aria-label={t("structure.name")}
        />
        {kind === "team" && (
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger aria-label={t("structure.department")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departments.map((department) => (
                <SelectItem key={department._id} value={department._id}>
                  {t("structure.inDepartment", { name: department.name })}
                </SelectItem>
              ))}
              <SelectItem value={NONE}>{t("structure.noDepartment")}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </ResponsiveDialog>
  );
}
