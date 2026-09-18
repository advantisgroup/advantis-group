"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";

import { ConfirmDialog } from "@/components/activity/ConfirmDialog";
import { CopyButton } from "@/components/activity/CopyButton";
import { EditPersonDialog } from "@/components/activity/EditPersonDialog";
import { BrandedText } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import { PersonIdentityBadges } from "@/components/people/PersonIdentityBadges";
import { useIsManager } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/activity/i18n";
import { useMutationWithToast } from "@/lib/activity/useMutationWithToast";
import { useSlashFocus } from "@/lib/activity/useSlashFocus";

import type { GenericId } from "convex/values";

/** Read-only value with an optional copy-to-clipboard action, for integration ids. */
function IdValue({ value, label }: { value?: string; label: string }) {
  const { t } = useI18n();
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return <span className="font-mono text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-xs">{trimmed}</span>
      <CopyButton value={trimmed} label={`${t("common.copy")} · ${label}`} />
    </div>
  );
}

/** Labelled field wrapper for the mobile roster cards. */
function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export default function PeoplePage() {
  const { t } = useI18n();
  const canEdit = useIsManager();
  const people = useQuery(api.activity.people.list);
  const intranetUsers = useQuery(api.people.users.list, {});
  const create = useMutationWithToast(api.activity.people.create);
  const update = useMutationWithToast(api.activity.people.update);
  const remove = useMutationWithToast(api.activity.people.remove);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  const [deleteTarget, setDeleteTarget] = useState<GenericId<"people"> | null>(null);
  const [editTarget, setEditTarget] = useState<GenericId<"people"> | null>(null);

  // Client-side roster filter — name / email / any integration id. Cheap, and
  // keeps the table usable as the headcount grows past the first handful.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !people) return people ?? [];
    return people.filter((p) =>
      [p.name, p.email, p.employeeId, p.genesysUserId, p.clockodoUserId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [people, query]);

  const header = (
    <PageHeader title={t("people.heading")} description={t("people.sub")} icon={<Users />} />
  );

  if (people === undefined) {
    return (
      <section className="space-y-6">
        {header}
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await create({
      name: name.trim(),
      email: email.trim() || undefined,
    });
    if (created) {
      setName("");
      setEmail("");
    }
  }

  // ── shared row pieces ──────────────────────────────────────────────────
  // The roster renders twice — stacked cards on mobile, a table from md up —
  // so the delete/edit buttons and read-only cells live in one place.

  const linkableUsers = (intranetUsers ?? []).map((u) => ({
    _id: u._id as string,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
    role: u.role,
    department: u.department,
    teams: u.teams,
  }));

  const editingPerson = editTarget ? (people.find((p) => p._id === editTarget) ?? null) : null;

  // Once a person is linked to an intranet account, `users.clockodoUserId`
  // (set via Admin → Integrations → Clockodo) is canonical — this cell links
  // out instead of showing a value that could drift from the real source.
  const clockodoIdCell = (p: { userId?: GenericId<"users">; clockodoUserId?: string }) =>
    p.userId ? (
      <div className="flex min-w-[8rem] items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {p.clockodoUserId?.trim() || "—"}
        </span>
        <Link
          href="/admin/integrations/clockodo"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-fg"
        >
          {t("people.manageInIntegrations")}
        </Link>
      </div>
    ) : (
      <IdValue value={p.clockodoUserId} label={t("people.clockodoId")} />
    );

  const userLinkCell = (p: { userId?: GenericId<"users"> }) => {
    const linked = linkableUsers.find((u) => u._id === (p.userId as string));
    if (!linked) {
      return <span className="text-sm text-muted-foreground">{t("people.intranetUserNone")}</span>;
    }
    return (
      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">{linked.name}</span>
        <PersonIdentityBadges
          role={linked.role}
          department={linked.department}
          teams={linked.teams}
          className="flex flex-wrap items-center gap-1"
        />
      </div>
    );
  };

  const activeBadge = (active: boolean) => (
    <Badge variant={active ? "success" : "muted"}>
      {active ? t("people.active") : t("status.disabled")}
    </Badge>
  );

  const rowActions = (id: GenericId<"people">) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditTarget(id)}
        aria-label={t("people.edit")}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDeleteTarget(id)}
        className="text-danger hover:bg-danger/10 hover:text-danger"
        aria-label={t("people.delete")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <section className="space-y-6">
      {header}

      {canEdit && (
        <Card className="animate-fade-up">
          <CardContent className="p-3 sm:p-4">
            <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("people.name")}
                className="sm:flex-1"
              />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("people.email")}
                className="sm:flex-1"
              />
              <Button type="submit" disabled={!name.trim()} className="sm:w-auto">
                <Plus className="h-4 w-4" />
                {t("people.add")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Roster search — outside the table card so the mobile card list and
          the desktop table share one input. */}
      {people.length > 0 && (
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            aria-label={t("common.search")}
            className="pl-9"
          />
        </div>
      )}

      {/* Mobile: one card per person. Read-only display — edits open the
          dialog instead of live inline inputs. */}
      <div className="space-y-3 md:hidden">
        {people.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("people.empty")}
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("common.noResults")}
            </CardContent>
          </Card>
        ) : (
          filtered.map((p) => (
            <Card key={p._id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium text-fg">{p.name}</p>
                  {canEdit && rowActions(p._id)}
                </div>
                <Field label={t("people.email")}>
                  <p className="text-sm text-muted-foreground">{p.email?.trim() || "—"}</p>
                </Field>
                <Field label={t("people.employeeId")}>
                  <IdValue value={p.employeeId} label={t("people.employeeId")} />
                </Field>
                <Field label={<BrandedText text={t("people.genesysId")} />}>
                  <IdValue value={p.genesysUserId} label={t("people.genesysId")} />
                </Field>
                <Field label={<BrandedText text={t("people.clockodoId")} />}>
                  {clockodoIdCell(p)}
                </Field>
                <Field label={t("people.intranetUser")}>{userLinkCell(p)}</Field>
                <div className="pt-1">{activeBadge(p.active)}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* md and up: the full table. */}
      <Card className="hidden md:block">
        <Table aria-label={t("nav.people")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("people.name")}</TableHead>
              <TableHead>{t("people.email")}</TableHead>
              <TableHead>{t("people.employeeId")}</TableHead>
              <TableHead>
                <BrandedText text={t("people.genesysId")} />
              </TableHead>
              <TableHead>
                <BrandedText text={t("people.clockodoId")} />
              </TableHead>
              <TableHead>{t("people.intranetUser")}</TableHead>
              <TableHead>{t("people.active")}</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 8 : 7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {t("people.empty")}
                </TableCell>
              </TableRow>
            )}
            {people.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 8 : 7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => (
              <TableRow key={p._id}>
                <TableCell className="text-fg">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.email?.trim() || "—"}</TableCell>
                <TableCell>
                  <IdValue value={p.employeeId} label={t("people.employeeId")} />
                </TableCell>
                <TableCell>
                  <IdValue value={p.genesysUserId} label={t("people.genesysId")} />
                </TableCell>
                <TableCell>{clockodoIdCell(p)}</TableCell>
                <TableCell>{userLinkCell(p)}</TableCell>
                <TableCell>{activeBadge(p.active)}</TableCell>
                {canEdit && <TableCell className="text-right">{rowActions(p._id)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <EditPersonDialog
        person={editingPerson}
        linkableUsers={linkableUsers}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSave={(personId, patch) => {
          void update({ personId, ...patch }, { success: t("people.updated") });
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        heading={t("people.confirmDelete")}
        confirmLabel={t("people.delete")}
        onConfirm={async () => {
          if (deleteTarget) {
            await remove({ personId: deleteTarget }, { success: t("people.deleted") });
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
