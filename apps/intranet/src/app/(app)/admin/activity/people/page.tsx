"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "convex/react";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "@advantis/convex/api";
import { useI18n } from "@/lib/activity/i18n";
import type { GenericId } from "convex/values";
import { ConfirmDialog } from "@/components/activity/ConfirmDialog";
import { CopyButton } from "@/components/activity/CopyButton";
import { useMutationWithToast } from "@/lib/activity/useMutationWithToast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function PeoplePage() {
  const { t } = useI18n();
  const me = useQuery(api.users.me);
  const people = useQuery(api.activity.people.list);
  const create = useMutationWithToast(api.activity.people.create);
  const update = useMutationWithToast(api.activity.people.update);
  const remove = useMutationWithToast(api.activity.people.remove);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
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

  if (people === undefined) {
    return <Skeleton className="h-64 w-full" />;
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

  return (
    <section className="space-y-6">
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

      <Card>
        {people.length > 0 && (
          <div className="border-b border-border-soft p-3">
            <div className="relative max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t("common.search")}
                aria-label={t("common.search")}
                className="pl-9"
              />
            </div>
          </div>
        )}
        <Table aria-label={t("nav.people")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("people.name")}</TableHead>
              <TableHead>{t("people.email")}</TableHead>
              <TableHead>{t("people.employeeId")}</TableHead>
              <TableHead>{t("people.genesysId")}</TableHead>
              <TableHead>{t("people.clockodoId")}</TableHead>
              <TableHead>{t("people.active")}</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 7 : 6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {t("people.empty")}
                </TableCell>
              </TableRow>
            )}
            {people.length > 0 && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 7 : 6}
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
                    onSave={value =>
                      void update(
                        { personId: p._id, name: value },
                        { success: t("people.updated") }
                      )
                    }
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <EditableText
                    initial={p.email ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.email")}
                    className="text-muted-foreground"
                    onSave={value =>
                      void update(
                        { personId: p._id, email: value },
                        { success: t("people.updated") }
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <EditableId
                    initial={p.employeeId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.employeeId")}
                    onSave={value =>
                      void update(
                        { personId: p._id, employeeId: value },
                        { success: t("people.updated") }
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <EditableId
                    initial={p.genesysUserId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.genesysId")}
                    onSave={value =>
                      void update(
                        { personId: p._id, genesysUserId: value },
                        { success: t("people.updated") }
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <EditableId
                    initial={p.clockodoUserId ?? ""}
                    disabled={!canEdit}
                    placeholder={t("people.clockodoId")}
                    onSave={value =>
                      void update(
                        { personId: p._id, clockodoUserId: value },
                        { success: t("people.updated") }
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={p.active}
                    disabled={!canEdit}
                    aria-label={t("people.active")}
                    onCheckedChange={checked => {
                      void update(
                        { personId: p._id, active: checked === true },
                        { success: t("people.updated") }
                      );
                    }}
                  />
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(p._id)}
                      className="text-danger hover:text-danger hover:bg-danger/10"
                      aria-label={t("people.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
