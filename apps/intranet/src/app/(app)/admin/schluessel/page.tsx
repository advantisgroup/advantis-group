"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowLeftRight,
  History,
  Key,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonPicker } from "@/components/people/PersonPicker";
import { useIsAdmin } from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { formatDateTime, matchesSearch } from "@/lib/format";

type KeyRow = FunctionReturnType<typeof api.officeKeys.list>[number];
type Filter = "all" | "issued" | "office";

/**
 * Schlüssel: every physical key and who has it. Admins only. Hand-overs are
 * logged per key; keys still with someone who has left are flagged on top.
 */
export default function KeysPage() {
  const t = useTranslations("Keys");
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const keys = useQuery(api.officeKeys.list, isAdmin ? {} : "skip");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<KeyRow | "new" | null>(null);
  const [handingOver, setHandingOver] = useState<KeyRow | null>(null);
  const [historyOf, setHistoryOf] = useState<KeyRow | null>(null);

  const actions = useMemo(
    () => [{ key: "new", label: t("add"), icon: Plus, onClick: () => setEditing("new") }],
    [t],
  );

  if (!isAdmin) return <ForbiddenScreen />;

  const all = keys ?? [];
  const gone = all.filter((key) => key.holderGone);
  const visible = all.filter(
    (key) =>
      (filter === "all" ||
        (filter === "issued" ? key.holderUserId !== null : key.holderUserId === null)) &&
      matchesSearch(search, key.label, key.number, key.opens, key.holderName, key.note),
  );
  const issued = all.filter((key) => key.holderUserId !== null).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <PageHeaderBar
        title={t("title")}
        description={t("description", { total: all.length, issued })}
        icon={<Key />}
      />
      <PageHeaderActions actions={actions} />

      {gone.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <p>
            {t("goneWarning", { count: gone.length })}{" "}
            <span className="font-medium">
              {gone.map((key) => `${key.label} (${key.holderName})`).join(", ")}
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="pl-9"
            aria-label={t("search")}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="sm:w-48" aria-label={t("filter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAll")}</SelectItem>
            <SelectItem value="issued">{t("filterIssued")}</SelectItem>
            <SelectItem value="office">{t("filterOffice")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {keys === undefined ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<Key />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus />
              {t("add")}
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {visible.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel-2 text-muted-foreground ring-1 ring-inset ring-border">
                <Key className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {key.label}
                  {key.number && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {key.number}
                    </span>
                  )}
                </p>
                {(key.opens || key.note) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[key.opens, key.note].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <div className="text-right text-sm">
                {key.holderName ? (
                  <>
                    <p className="flex items-center justify-end gap-1.5 font-medium">
                      {key.holderName}
                      {key.holderGone && <Badge variant="warning">{t("gone")}</Badge>}
                    </p>
                    {key.issuedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("since", { date: formatDateTime(key.issuedAt, locale) })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("inOffice")}</p>
                )}
              </div>
              <RowActions
                row={key}
                onHandOver={() => setHandingOver(key)}
                onEdit={() => setEditing(key)}
                onHistory={() => setHistoryOf(key)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <KeyDialog row={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {handingOver && <HandOverDialog row={handingOver} onClose={() => setHandingOver(null)} />}
      {historyOf && <HistoryDialog row={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}

function RowActions({
  row,
  onHandOver,
  onEdit,
  onHistory,
}: {
  row: KeyRow;
  onHandOver: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const t = useTranslations("Keys");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const setHolder = useMutation(api.officeKeys.setHolder);
  const remove = useMutation(api.officeKeys.remove);

  async function takeBack() {
    await setHolder({ keyId: row.id, holderUserId: null })
      .then(() => toast.success(t("returnedToast")))
      .catch(handleError);
  }

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteTitle", { label: row.label }),
      description: t("deleteBody"),
      confirmLabel: t("delete"),
      cancelLabel: tc("cancel"),
    });
    if (ok) await remove({ keyId: row.id }).catch(handleError);
  }

  return (
    <div className="flex items-center gap-1">
      {row.holderUserId ? (
        <Button variant="outline" size="sm" onClick={() => void takeBack()}>
          <Undo2 />
          {t("takeBack")}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={onHandOver}>
          <ArrowLeftRight />
          {t("issue")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={t("more", { label: row.label })}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.holderUserId && (
            <DropdownMenuItem onSelect={onHandOver}>
              <ArrowLeftRight />
              {t("handOver")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onHistory}>
            <History />
            {t("history")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => void onDelete()}
          >
            <Trash2 />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function KeyDialog({ row, onClose }: { row?: KeyRow; onClose: () => void }) {
  const t = useTranslations("Keys");
  const handleError = useErrorHandler();
  const create = useMutation(api.officeKeys.create);
  const update = useMutation(api.officeKeys.update);
  const [label, setLabel] = useState(row?.label ?? "");
  const [number, setNumber] = useState(row?.number ?? "");
  const [opens, setOpens] = useState(row?.opens ?? "");
  const [note, setNote] = useState(row?.note ?? "");
  const [holder, setHolder] = useState<Id<"users"> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const fields = { label, number, opens, note };
      if (row) await update({ keyId: row.id, ...fields });
      else await create({ ...fields, holderUserId: holder ?? undefined });
      toast.success(t("saved"));
      onClose();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={row ? t("editTitle") : t("add")}
      footer={
        <Button
          disabled={saving || !label.trim()}
          onClick={() => void save()}
          className="w-full sm:w-auto"
        >
          {t("save")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor="key-label">{t("fieldLabel")}</Label>
            <Input
              id="key-label"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("fieldLabelPlaceholder")}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-number">{t("fieldNumber")}</Label>
            <Input
              id="key-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={t("fieldNumberPlaceholder")}
              maxLength={40}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key-opens">{t("fieldOpens")}</Label>
          <Input
            id="key-opens"
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
            placeholder={t("fieldOpensPlaceholder")}
            maxLength={200}
          />
        </div>
        {!row && (
          <div className="space-y-1.5">
            <Label>{t("fieldHolder")}</Label>
            <PersonPicker
              value={holder}
              onChange={(userId) => setHolder(userId)}
              noneLabel={t("inOffice")}
              placeholder={t("inOffice")}
              label={t("fieldHolder")}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="key-note">{t("fieldNote")}</Label>
          <Textarea
            id="key-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function HandOverDialog({ row, onClose }: { row: KeyRow; onClose: () => void }) {
  const t = useTranslations("Keys");
  const handleError = useErrorHandler();
  const setHolder = useMutation(api.officeKeys.setHolder);
  const [holder, setHolderState] = useState<Id<"users"> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!holder) return;
    setSaving(true);
    try {
      await setHolder({ keyId: row.id, holderUserId: holder });
      toast.success(t("issuedToast"));
      onClose();
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("handOverTitle", { label: row.label })}
      description={row.holderName ? t("handOverFrom", { name: row.holderName }) : undefined}
      footer={
        <Button
          disabled={saving || !holder}
          onClick={() => void save()}
          className="w-full sm:w-auto"
        >
          {t("issue")}
        </Button>
      }
    >
      <PersonPicker
        value={holder}
        onChange={(userId) => setHolderState(userId)}
        exclude={[row.holderUserId]}
        label={t("fieldHolder")}
      />
    </ResponsiveDialog>
  );
}

function HistoryDialog({ row, onClose }: { row: KeyRow; onClose: () => void }) {
  const t = useTranslations("Keys");
  const locale = useLocale();
  const rows = useQuery(api.officeKeys.history, { keyId: row.id });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("historyTitle", { label: row.label })}
    >
      {rows === undefined ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : (
        <ul className="divide-y divide-border/60 text-sm">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
              <span>
                {t(`action.${entry.action}`, { name: entry.holderName ?? "–" })}
                <span className="block text-xs text-muted-foreground">
                  {t("by", { name: entry.byName })}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDateTime(entry.at, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveDialog>
  );
}
