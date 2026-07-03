"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { Plus, Search, Trash2, Users } from "lucide-react";

import { ConfirmDialog } from "@/components/activity/ConfirmDialog";
import { CopyButton } from "@/components/activity/CopyButton";
import { BrandedText } from "@/components/branding/ProviderMark";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/**
 * Inline-editable id cell. Saves on blur (and Enter) only when the value
 * actually changed, so the integration mappings can be maintained right in the
 * roster without a modal.
 */
function EditableId({
  initial,
  disabled,
  placeholder,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);

  return (
    // gap + shrink-0 copy button keep the field and the action from colliding,
    // even in the narrow integration-id columns on mobile.
    <div className="flex w-full min-w-[8rem] items-center gap-1.5">
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onBlur={() => {
          if (value !== initial) onSave(value);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 flex-1 font-mono text-xs"
      />
      {value.trim() !== "" && (
        <CopyButton
          value={value}
          label={`${t("common.copy")} · ${placeholder}`}
        />
      )}
    </div>
  );
}

/**
 * Inline-editable text cell for free-form fields (name, email). Saves on blur
 * (and Enter) only when the trimmed value changed. A `required` field reverts
 * to its previous value rather than saving an empty string; otherwise an empty
 * value clears the field. When the viewer can't edit, it renders as plain text.
 */
function EditableText({
  initial,
  disabled,
  placeholder,
  className,
  required,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  placeholder: string;
  className?: string;
  required?: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  if (disabled) {
    return <span className={className}>{initial.trim() || "—"}</span>;
  }

  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        const next = value.trim();
        if (required && next === "") {
          setValue(initial);
          return;
        }
        if (next !== initial) onSave(next);
      }}
      onKeyDown={e => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-8 w-full min-w-[8rem]"
    />
  );
}

/**
 * Person → intranet account link. This is what lets ActivityTrack-only
 * mappings (Clockodo/Genesys ids kept in the roster) carry over to the rest of
 * the intranet — e.g. mirrored Clockodo absences resolve through this link for
 * employees whose intranet account has no Clockodo id of its own.
 */
function UserLinkSelect({
  value,
  users,
  disabled,
  noneLabel,
  onChange,
}: {
  value: string | undefined;
  users: { _id: string; name: string }[];
  disabled: boolean;
  noneLabel: string;
  onChange: (userId: string | null) => void;
}) {
  if (disabled) {
    const linked = users.find(u => u._id === value);
    return (
      <span className="text-sm text-muted-foreground">
        {linked?.name ?? "—"}
      </span>
    );
  }
  return (
    <Select
      value={value ?? "none"}
      onValueChange={v => onChange(v === "none" ? null : v)}
    >
      <SelectTrigger className="h-8 w-full min-w-[10rem] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{noneLabel}</SelectItem>
        {users.map(u => (
          <SelectItem key={u._id} value={u._id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const me = useQuery(api.users.me);
  const people = useQuery(api.activity.people.list);
  const intranetUsers = useQuery(api.users.list, {});
  const create = useMutationWithToast(api.activity.people.create);
  const update = useMutationWithToast(api.activity.people.update);
  const remove = useMutationWithToast(api.activity.people.remove);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useSlashFocus<HTMLInputElement>();
  const [deleteTarget, setDeleteTarget] = useState<GenericId<"people"> | null>(
    null
  );

  const canEdit = me?.role === "admin" || me?.role === "manager";

  // Client-side roster filter — name / email / any integration id. Cheap, and
  // keeps the table usable as the headcount grows past the first handful.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !people) return people ?? [];
    return people.filter(p =>
      [p.name, p.email, p.employeeId, p.genesysUserId, p.clockodoUserId]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [people, query]);

  const header = (
    <PageHeader
      title={t("people.heading")}
      description={t("people.sub")}
      icon={<Users />}
    />
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
  // so the save path and the delete button live in one place.

  const save = (
    personId: GenericId<"people">,
    patch: Partial<{
      name: string;
      email: string;
      userId: GenericId<"users"> | null;
      employeeId: string;
      genesysUserId: string;
      clockodoUserId: string;
      active: boolean;
    }>
  ) => void update({ personId, ...patch }, { success: t("people.updated") });

  const linkableUsers = (intranetUsers ?? []).map(u => ({
    _id: u._id as string,
    name:
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
  }));

  const userLinkCell = (p: {
    _id: GenericId<"people">;
    userId?: GenericId<"users">;
  }) => (
    <UserLinkSelect
      value={p.userId as string | undefined}
      users={linkableUsers}
      disabled={!canEdit}
      noneLabel={t("people.intranetUserNone")}
      onChange={userId =>
        save(p._id, { userId: (userId as GenericId<"users"> | null) ?? null })
      }
    />
  );

  const deleteButton = (id: GenericId<"people">) => (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setDeleteTarget(id)}
      className="text-danger hover:bg-danger/10 hover:text-danger"
      aria-label={t("people.delete")}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  return (
    <section className="space-y-6">
      {header}

      {canEdit && (
        <Card className="animate-fade-up">
          <CardContent className="p-3 sm:p-4">
            <form
              onSubmit={onAdd}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t("people.name")}
                className="sm:flex-1"
              />
              <Input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t("people.email")}
                className="sm:flex-1"
              />
              <Button
                type="submit"
                disabled={!name.trim()}
                className="sm:w-auto"
              >
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
            onChange={e => setQuery(e.target.value)}
            placeholder={t("common.search")}
            aria-label={t("common.search")}
            className="pl-9"
          />
        </div>
      )}

      {/* Mobile: one card per person — seven editable columns can't fit a
          phone, and horizontal scrolling hides the fields being edited. */}
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
          filtered.map(p => (
            <Card key={p._id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <EditableText
                      initial={p.name}
                      disabled={!canEdit}
                      required
                      placeholder={t("people.name")}
                      className="font-medium text-fg"
                      onSave={value => save(p._id, { name: value })}
                    />
                  </div>
                  {canEdit && deleteButton(p._id)}
                </div>
                <Field label={t("people.email")}>
                  <EditableText
                    initial={p.email ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.email")}
                    className="text-sm text-muted-foreground"
                    onSave={value => save(p._id, { email: value })}
                  />
                </Field>
                <Field label={t("people.employeeId")}>
                  <EditableId
                    initial={p.employeeId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.employeeId")}
                    onSave={value => save(p._id, { employeeId: value })}
                  />
                </Field>
                <Field label={<BrandedText text={t("people.genesysId")} />}>
                  <EditableId
                    initial={p.genesysUserId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.genesysId")}
                    onSave={value => save(p._id, { genesysUserId: value })}
                  />
                </Field>
                <Field label={<BrandedText text={t("people.clockodoId")} />}>
                  <EditableId
                    initial={p.clockodoUserId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.clockodoId")}
                    onSave={value => save(p._id, { clockodoUserId: value })}
                  />
                </Field>
                <Field label={t("people.intranetUser")}>{userLinkCell(p)}</Field>
                <label className="flex w-fit items-center gap-2 pt-1 text-sm text-fg">
                  <Checkbox
                    checked={p.active}
                    disabled={!canEdit}
                    aria-label={t("people.active")}
                    onCheckedChange={checked =>
                      save(p._id, { active: checked === true })
                    }
                  />
                  {t("people.active")}
                </label>
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
            {filtered.map(p => (
              <TableRow key={p._id}>
                <TableCell className="text-fg">
                  <EditableText
                    initial={p.name}
                    disabled={!canEdit}
                    required
                    placeholder={t("people.name")}
                    className="text-fg"
                    onSave={value => save(p._id, { name: value })}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <EditableText
                    initial={p.email ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.email")}
                    className="text-muted-foreground"
                    onSave={value => save(p._id, { email: value })}
                  />
                </TableCell>
                <TableCell>
                  <EditableId
                    initial={p.employeeId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.employeeId")}
                    onSave={value => save(p._id, { employeeId: value })}
                  />
                </TableCell>
                <TableCell>
                  <EditableId
                    initial={p.genesysUserId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.genesysId")}
                    onSave={value => save(p._id, { genesysUserId: value })}
                  />
                </TableCell>
                <TableCell>
                  <EditableId
                    initial={p.clockodoUserId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.clockodoId")}
                    onSave={value => save(p._id, { clockodoUserId: value })}
                  />
                </TableCell>
                <TableCell>{userLinkCell(p)}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={p.active}
                    disabled={!canEdit}
                    aria-label={t("people.active")}
                    onCheckedChange={checked =>
                      save(p._id, { active: checked === true })
                    }
                  />
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    {deleteButton(p._id)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        heading={t("people.confirmDelete")}
        confirmLabel={t("people.delete")}
        onConfirm={async () => {
          if (deleteTarget) {
            await remove(
              { personId: deleteTarget },
              { success: t("people.deleted") }
            );
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
