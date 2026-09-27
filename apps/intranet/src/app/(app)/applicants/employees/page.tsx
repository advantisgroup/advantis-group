"use client";

import { type ReactNode, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  FileText,
  FolderOpen,
  Link2,
  Plus,
  Search,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { PersonAvatar, PersonPicker, type PersonOption } from "@/components/people/PersonPicker";
import { PersonLink } from "@/components/profile/PersonLink";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { matchesSearch } from "@/lib/format";
import { cn } from "@/lib/utils";

type DirectoryFilter = "all" | "linked" | "unlinked" | "documents" | "left" | "archived";

function CreateEmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const handleError = useErrorHandler();
  const createProfile = useMutation(api.hr.employees.createProfile);
  const linkedAccounts = useQuery(api.hr.employees.linkedAccounts, open ? {} : "skip");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [busy, setBusy] = useState(false);
  const hasRecord = new Set(linkedAccounts?.map((account) => account.userId));

  function reset() {
    setName("");
    setEmail("");
    setJobTitle("");
    setDepartment("");
    setUserId(null);
  }

  function pickAccount(id: Id<"users"> | null, person: PersonOption | null) {
    setUserId(id);
    if (!person) return;
    setName((current) => current || person.name);
    setEmail((current) => current || person.email);
    setJobTitle((current) => current || person.jobTitle || "");
    setDepartment((current) => current || person.department || "");
  }

  async function onSubmit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createProfile({
        name,
        email: email || undefined,
        jobTitle: jobTitle || undefined,
        department: department || undefined,
        userId: userId ?? undefined,
      });
      toast.success(t("employeeCreated"));
      reset();
      onOpenChange(false);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("employeeNew")}
      contentClassName="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={busy || !name.trim()}
            className="max-sm:flex-1"
          >
            {tc("create")}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label>{t("employeeAccount")}</Label>
        <PersonPicker
          value={userId}
          onChange={pickAccount}
          label={t("employeeAccount")}
          noneLabel={t("employeeNoAccount")}
          hint={(person) => (hasRecord.has(person.userId) ? t("employeeHasRecord") : null)}
          isDisabled={(person) => hasRecord.has(person.userId)}
        />
        <p className="text-xs text-muted-foreground">{t("employeeAccountPickHint")}</p>
      </div>
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("name")}
        aria-label={t("name")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("email")}
          aria-label={t("email")}
        />
        <Input
          value={jobTitle}
          onChange={(event) => setJobTitle(event.target.value)}
          placeholder={t("jobTitle")}
          aria-label={t("jobTitle")}
        />
      </div>
      <Input
        value={department}
        onChange={(event) => setDepartment(event.target.value)}
        placeholder={t("department")}
        aria-label={t("department")}
      />
    </ResponsiveDialog>
  );
}

function DirectoryStat({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-20 items-center gap-3 rounded-lg border border-border/70 bg-card px-4 text-left transition-colors hover:bg-accent/40",
        active && "border-primary bg-primary/5",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span>
        <span className="block font-display text-xl font-bold tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

export default function EmployeesPage() {
  const t = useTranslations("Applicants");
  const tc = useTranslations("Common");
  const router = useRouter();
  const allProfiles = useQuery(api.hr.employees.listProfiles, { includeArchived: true });
  const importable = useQuery(api.hr.employees.backfillCandidates, {});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const profiles = useMemo(
    () => allProfiles?.filter((profile) => profile.status === "active"),
    [allProfiles],
  );
  const archived = useMemo(
    () => allProfiles?.filter((profile) => profile.status === "archived") ?? [],
    [allProfiles],
  );

  const counts = useMemo(() => {
    const all = profiles ?? [];
    return {
      all: all.length,
      linked: all.filter((profile) => profile.userId).length,
      unlinked: all.filter((profile) => !profile.userId).length,
      documents: all.filter((profile) => profile.documentsCount > 0).length,
      left: all.filter((profile) => profile.accountStatus === "removed").length,
    };
  }, [profiles]);

  const filtered = useMemo(() => {
    return ((filter === "archived" ? archived : profiles) ?? []).filter((profile) => {
      const matchesFilter =
        filter === "all" ||
        filter === "archived" ||
        (filter === "linked" && !!profile.userId) ||
        (filter === "unlinked" && !profile.userId) ||
        (filter === "documents" && profile.documentsCount > 0) ||
        (filter === "left" && profile.accountStatus === "removed");
      return (
        matchesFilter &&
        matchesSearch(search, profile.name, profile.email, profile.jobTitle, profile.department)
      );
    });
  }, [archived, filter, profiles, search]);

  function openProfile(employeeProfileId: Id<"employeeProfiles">) {
    router.push(`/hr/employees/${employeeProfileId}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("employeeDirectoryTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("employeeDirectoryDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/hr/files">
              <FolderOpen className="size-4" />
              {t("browseFiles")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/hr/employees/import">
              <UserPlus className="size-4" />
              {t("employeeImport")}
            </Link>
          </Button>
          <Button data-shortcut-new onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("employeeNew")}
          </Button>
        </div>
      </div>

      {importable && importable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-4 py-3">
          <AvatarStack
            max={4}
            people={importable.map((person) => ({
              id: person.userId,
              name: person.name,
              avatar: person.avatarUrl,
            }))}
          />
          <p className="min-w-0 flex-1 text-sm">
            {t("employeeImportBanner", { count: importable.length })}
          </p>
          <Button size="sm" variant="outline" asChild>
            <Link href="/hr/employees/import">{t("employeeImport")}</Link>
          </Button>
        </div>
      )}

      {counts.left > 0 && filter !== "left" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
          <UserX className="size-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm">
            {t("employeeLeftBanner", { count: counts.left })}
          </p>
          <Button size="sm" variant="outline" onClick={() => setFilter("left")}>
            {t("employeeLeftReview")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <DirectoryStat
          label={t("employeeStatAll")}
          value={counts.all}
          icon={<Users className="size-4" />}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <DirectoryStat
          label={t("employeeStatLinked")}
          value={counts.linked}
          icon={<Link2 className="size-4" />}
          active={filter === "linked"}
          onClick={() => setFilter(filter === "linked" ? "all" : "linked")}
        />
        <DirectoryStat
          label={t("employeeStatUnlinked")}
          value={counts.unlinked}
          icon={<UserPlus className="size-4" />}
          active={filter === "unlinked"}
          onClick={() => setFilter(filter === "unlinked" ? "all" : "unlinked")}
        />
        <DirectoryStat
          label={t("employeeStatDocuments")}
          value={counts.documents}
          icon={<FileText className="size-4" />}
          active={filter === "documents"}
          onClick={() => setFilter(filter === "documents" ? "all" : "documents")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 max-w-lg flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("employeeSearchPlaceholder")}
            className="pl-9"
          />
        </div>
        {(filter === "left" || filter === "archived" || archived.length > 0) && (
          <Button
            variant={filter === "left" || filter === "archived" ? "secondary" : "ghost"}
            onClick={() =>
              setFilter(filter === "left" || filter === "archived" ? "all" : "archived")
            }
          >
            {filter === "left" ? (
              <>
                <X className="size-4" />
                {t("employeeLeftBadge")}
              </>
            ) : (
              <>
                {filter === "archived" ? <X className="size-4" /> : <Archive className="size-4" />}
                {t("employeeShowArchived", { count: archived.length })}
              </>
            )}
          </Button>
        )}
      </div>

      {profiles === undefined ? null : filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus />}
          title={t("employeesEmpty")}
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                {tc("clearSearch")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus />
                {t("employeeNew")}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border/70 bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("employee")}</TableHead>
                  <TableHead>{t("jobTitle")}</TableHead>
                  <TableHead>{t("department")}</TableHead>
                  <TableHead>{t("employeeAccount")}</TableHead>
                  <TableHead className="text-center">{t("employeeDocuments")}</TableHead>
                  <TableHead>{t("statusLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((profile) => (
                  <TableRow
                    key={profile._id}
                    className="cursor-pointer"
                    onClick={() => openProfile(profile._id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PersonAvatar
                          person={{
                            name: profile.name,
                            email: profile.email ?? "",
                            avatarUrl: profile.linkedProfile?.avatarUrl ?? null,
                          }}
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/hr/employees/${profile._id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-medium hover:underline"
                          >
                            {profile.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {profile.email || t("employeeNoEmail")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{profile.jobTitle || "–"}</TableCell>
                    <TableCell>{profile.department || "–"}</TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {profile.accountStatus === "removed" ? (
                        <Badge variant="warning">{t("employeeLeftBadge")}</Badge>
                      ) : profile.linkedProfile ? (
                        <span className="inline-flex max-w-52 items-center gap-1.5 text-sm">
                          <Link2 className="size-3.5 shrink-0 text-success" />
                          <PersonLink userId={profile.linkedProfile.userId}>
                            {profile.linkedProfile.name}
                          </PersonLink>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("employeeNotLinked")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {profile.documentsCount}
                    </TableCell>
                    <TableCell>
                      <Badge variant={profile.status === "active" ? "success" : "muted"}>
                        {t(`employeeStatus.${profile.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2 md:hidden">
            {filtered.map((profile) => (
              <button
                key={profile._id}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card p-3 text-left"
                onClick={() => openProfile(profile._id)}
              >
                <PersonAvatar
                  className="size-9"
                  person={{
                    name: profile.name,
                    email: profile.email ?? "",
                    avatarUrl: profile.linkedProfile?.avatarUrl ?? null,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium">{profile.name}</span>
                    {profile.linkedProfile && (
                      <Link2
                        className="size-3.5 shrink-0 text-success"
                        aria-label={t("employeeLinked")}
                      />
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {profile.jobTitle || profile.department || profile.email || "–"}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="size-3.5" />
                  {profile.documentsCount}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <CreateEmployeeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
