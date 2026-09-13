"use client";

import { type ReactNode, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileText, FolderOpen, Link2, Plus, Search, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NONE = "__none__";
type DirectoryFilter = "all" | "linked" | "unlinked" | "documents";

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
  const createProfile = useMutation(api.humanResources.createProfile);
  const users = useQuery(api.users.list, {}) ?? [];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [userId, setUserId] = useState(NONE);
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setJobTitle("");
    setDepartment("");
    setUserId(NONE);
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
        userId: userId === NONE ? undefined : (userId as Id<"users">),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("employeeNew")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("name")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("email")}
            />
            <Input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              placeholder={t("jobTitle")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder={t("department")}
            />
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("employeeNoAccount")}</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy || !name.trim()}>
            {tc("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const profiles = useQuery(api.humanResources.listProfiles, {});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const counts = useMemo(() => {
    const all = profiles ?? [];
    return {
      all: all.length,
      linked: all.filter((profile) => profile.userId).length,
      unlinked: all.filter((profile) => !profile.userId).length,
      documents: all.filter((profile) => profile.documentsCount > 0).length,
    };
  }, [profiles]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (profiles ?? []).filter((profile) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "linked" && !!profile.userId) ||
        (filter === "unlinked" && !profile.userId) ||
        (filter === "documents" && profile.documentsCount > 0);
      if (!matchesFilter) return false;
      if (!query) return true;
      return `${profile.name} ${profile.email ?? ""} ${profile.jobTitle ?? ""} ${profile.department ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [filter, profiles, search]);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/hr/files">
              <FolderOpen className="size-4" />
              {t("browseFiles")}
            </Link>
          </Button>
          <Button data-shortcut-new onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("employeeNew")}
          </Button>
        </div>
      </div>

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

      <div className="relative max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("employeeSearchPlaceholder")}
          className="pl-9"
        />
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
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">
                            {initials(profile.name)}
                          </AvatarFallback>
                        </Avatar>
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
                    <TableCell>
                      {profile.linkedProfile ? (
                        <Badge variant="success">{profile.linkedProfile.name}</Badge>
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
                <Avatar className="size-9">
                  <AvatarFallback className="text-xs">{initials(profile.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{profile.name}</span>
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
