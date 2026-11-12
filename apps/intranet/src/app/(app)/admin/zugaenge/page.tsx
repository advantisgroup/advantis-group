"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsAdmin } from "@/components/providers/current-user";
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
import { formatDateTime, matchesSearch, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type VaultCategory, type VaultSecret, useVaultApi } from "@/lib/vault-api";

const CATEGORIES: VaultCategory[] = [
  "microsoft",
  "google",
  "ionos",
  "salesforce",
  "hosting",
  "devices",
  "other",
];

/** How long a revealed password stays on screen. */
const SHOW_MS = 30_000;

type Entry = NonNullable<ReturnType<typeof useEntries>>[number];

function useEntries(enabled: boolean) {
  return useQuery(api.vault.entries.list, enabled ? {} : "skip");
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!$%&*?#+-";
  const bytes = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function copy(text: string, done: string) {
  await navigator.clipboard.writeText(text);
  toast.success(done);
}

/**
 * Zugänge: the company's shared logins, admins only. Passwords never reach
 * Convex in plain text (apps/api encrypts them); every reveal lands in the
 * entry's history.
 */
export default function VaultPage() {
  const t = useTranslations("Vault");
  const isAdmin = useIsAdmin();
  const entries = useEntries(isAdmin);
  const vault = useVaultApi();
  const handleError = useErrorHandler();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<VaultCategory | "all">("all");
  const [editing, setEditing] = useState<{ entry?: Entry; secret?: VaultSecret } | null>(null);
  const [historyOf, setHistoryOf] = useState<Entry | null>(null);
  const [shown, setShown] = useState<{ id: string; secret: VaultSecret } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  const actions = useMemo(
    () => [{ key: "new", label: t("add"), icon: Plus, onClick: () => setEditing({}) }],
    [t],
  );

  if (!isAdmin) return <ForbiddenScreen />;

  async function reveal(entry: Entry): Promise<VaultSecret | null> {
    setBusy(entry.id);
    try {
      return await vault.reveal(entry.id);
    } catch (error) {
      handleError(error);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const visible = (entries ?? []).filter(
    (entry) =>
      (category === "all" || entry.category === category) &&
      matchesSearch(
        search,
        entry.title,
        entry.username,
        entry.url,
        t(`category.${entry.category}`),
      ),
  );
  const groups = CATEGORIES.map((c) => ({
    category: c,
    items: visible.filter((entry) => entry.category === c),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <PageHeaderBar title={t("title")} description={t("description")} icon={<KeyRound />} />
      <PageHeaderActions actions={actions} />

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
        <Select value={category} onValueChange={(v) => setCategory(v as VaultCategory | "all")}>
          <SelectTrigger className="sm:w-52" aria-label={t("categoryLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`category.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button size="sm" onClick={() => setEditing({})}>
              <Plus />
              {t("add")}
            </Button>
          }
        />
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`category.${group.category}`)}
            </h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
              {group.items.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  secret={shown?.id === entry.id ? shown.secret : null}
                  busy={busy === entry.id}
                  onToggle={async () => {
                    if (shown?.id === entry.id) return setShown(null);
                    const secret = await reveal(entry);
                    if (secret) setShown({ id: entry.id, secret });
                  }}
                  onCopy={async () => {
                    const secret = shown?.id === entry.id ? shown.secret : await reveal(entry);
                    if (secret) await copy(secret.password, t("copiedPassword"));
                  }}
                  onEdit={async () => {
                    const secret = await reveal(entry);
                    if (secret) setEditing({ entry, secret });
                  }}
                  onHistory={() => setHistoryOf(entry)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <EntryDialog
          entry={editing.entry}
          secret={editing.secret}
          onClose={() => setEditing(null)}
        />
      )}
      {historyOf && <HistoryDialog entry={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}

function EntryRow({
  entry,
  secret,
  busy,
  onToggle,
  onCopy,
  onEdit,
  onHistory,
}: {
  entry: Entry;
  secret: VaultSecret | null;
  busy: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const t = useTranslations("Vault");
  const tc = useTranslations("Common");
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const remove = useMutation(api.vault.entries.remove);

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteTitle", { title: entry.title }),
      description: t("deleteBody"),
      confirmLabel: t("delete"),
      cancelLabel: tc("cancel"),
    });
    if (ok) await remove({ entryId: entry.id }).catch(handleError);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {entry.username && (
              <button
                type="button"
                className="truncate hover:text-foreground"
                onClick={() => void copy(entry.username!, t("copiedUsername"))}
                title={t("copyUsername")}
              >
                {entry.username}
              </button>
            )}
            {entry.username && entry.url && <span aria-hidden>·</span>}
            {entry.url && (
              <a
                href={entry.url.startsWith("http") ? entry.url : `https://${entry.url}`}
                target="_blank"
                rel="noreferrer noopener"
                className="truncate hover:text-foreground hover:underline"
              >
                {entry.url.replace(/^https?:\/\//, "")}
              </a>
            )}
          </p>
        </div>
        <code
          className={cn(
            "max-w-56 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs",
            !secret && "text-muted-foreground",
          )}
        >
          {secret ? secret.password : "••••••••••"}
        </code>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggle}
            disabled={busy}
            aria-label={secret ? t("hide") : t("show")}
            title={secret ? t("hide") : t("show")}
          >
            {busy ? <Loader2 className="animate-spin" /> : secret ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onCopy}
            disabled={busy}
            aria-label={t("copyPassword")}
            title={t("copyPassword")}
          >
            <Copy />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                aria-label={t("more", { title: entry.title })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
      </div>
      {secret?.notes && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-xs">
          {secret.notes}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t("changed", {
          age: relativeTime(entry.updatedAt),
          name: entry.updatedByName ?? "–",
        })}
      </p>
    </li>
  );
}

function EntryDialog({
  entry,
  secret,
  onClose,
}: {
  entry?: Entry;
  secret?: VaultSecret;
  onClose: () => void;
}) {
  const t = useTranslations("Vault");
  const vault = useVaultApi();
  const handleError = useErrorHandler();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [category, setCategory] = useState<VaultCategory>(entry?.category ?? "microsoft");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [password, setPassword] = useState(secret?.password ?? "");
  const [notes, setNotes] = useState(secret?.notes ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !password) return;
    setSaving(true);
    try {
      const base = { title: title.trim(), category, username, url, notes };
      if (entry) {
        await vault.update(entry.id, {
          ...base,
          password: password !== secret?.password ? password : undefined,
        });
      } else {
        await vault.create({ ...base, password });
      }
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
      title={entry ? t("editTitle") : t("add")}
      description={t("formHint")}
      footer={
        <Button
          disabled={saving || !title.trim() || !password}
          onClick={() => void save()}
          className="w-full sm:w-auto"
        >
          {saving && <Loader2 className="animate-spin" />}
          {t("save")}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div className="space-y-1.5">
            <Label htmlFor="vault-title">{t("fieldTitle")}</Label>
            <Input
              id="vault-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("fieldTitlePlaceholder")}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("categoryLabel")}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as VaultCategory)}>
              <SelectTrigger aria-label={t("categoryLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`category.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vault-username">{t("fieldUsername")}</Label>
          <Input
            id="vault-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vault-password">{t("fieldPassword")}</Label>
          <div className="flex gap-2">
            <Input
              id="vault-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="font-mono"
              maxLength={500}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? t("hide") : t("show")}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                setPassword(generatePassword());
                setShowPassword(true);
              }}
              aria-label={t("generate")}
              title={t("generate")}
            >
              <RefreshCw />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vault-url">{t("fieldUrl")}</Label>
          <Input
            id="vault-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            maxLength={500}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vault-notes">{t("fieldNotes")}</Label>
          <Textarea
            id="vault-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("fieldNotesPlaceholder")}
            rows={3}
            maxLength={4000}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function HistoryDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useTranslations("Vault");
  const locale = useLocale();
  const rows = useQuery(api.vault.entries.history, { entryId: entry.id });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("historyTitle", { title: entry.title })}
    >
      {rows === undefined ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border/60 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium">{row.name ?? "–"}</span>{" "}
                <span className="text-muted-foreground">{t(`action.${row.action}`)}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDateTime(row.at, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveDialog>
  );
}
