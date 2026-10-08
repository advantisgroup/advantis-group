"use client";

import { useEffect, useMemo, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ExternalLink,
  ImageOff,
  Inbox,
  KeyRound,
  Loader2,
  Mail,
  MailWarning,
  Paperclip,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useSave } from "@/hooks/use-save";
import { ApiResponseError, useIntranetApiClient } from "@/lib/api-client";
import { matchesSearch } from "@/lib/format";
import {
  IONOS_WEBMAIL_URL,
  type InboxItem,
  type MailAddress,
  type MailMessage,
  downloadMailAttachment,
  fetchInboxPage,
  setMailAccount,
  useInbox,
  useMailMessage,
} from "@/lib/mail-api";
import { cn } from "@/lib/utils";

type View = { kind: "inbox" } | { kind: "message"; uid: number } | { kind: "manage" };

/**
 * The header's mail button and the panel it opens: the signed-in person's own
 * IONOS inbox, read-only. Hidden entirely while mail isn't switched on for
 * the caller (admins only until `MAIL_MODE=live`). Notifications deep-link
 * here with `?postfach=<uid>` on whatever page is open.
 */
export function MailHeaderButton() {
  const t = useTranslations("Mail");
  const status = useQuery(api.mail.accounts.myStatus);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "inbox" });

  const deepLink = searchParams.get("postfach");
  useEffect(() => {
    if (!deepLink || !status) return;
    const uid = Number(deepLink);
    // The deep link is consumed once; the URL shouldn't keep reopening the panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(
      deepLink === "verwalten" && status.isAdmin
        ? { kind: "manage" }
        : Number.isInteger(uid) && uid >= 1
          ? { kind: "message", uid }
          : { kind: "inbox" },
    );
    setOpen(true);
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("postfach");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [deepLink, status, searchParams, pathname, router]);

  if (!status) return null;
  const unseen = status.connected ? (status.unseen ?? 0) : 0;
  const broken = status.connected && status.error === "auth";

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={t("open")}
        title={t("title")}
        onClick={() => {
          setView({ kind: "inbox" });
          setOpen(true);
        }}
      >
        <Mail className="h-5 w-5" />
        {broken ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500" />
        ) : (
          unseen > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
              {unseen > 99 ? "99+" : unseen}
            </span>
          )
        )}
      </Button>
      <SidePanel
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        closeLabel={t("close")}
        header={
          <PanelHeader
            email={status.connected ? status.email : null}
            isAdmin={status.isAdmin}
            view={view}
            onView={setView}
          />
        }
      >
        {open && (
          <PanelBody
            view={view}
            onView={setView}
            connected={status.connected}
            authFailed={broken}
            isAdmin={status.isAdmin}
          />
        )}
      </SidePanel>
    </>
  );
}

function PanelHeader({
  email,
  isAdmin,
  view,
  onView,
}: {
  email: string | null;
  isAdmin: boolean;
  view: View;
  onView: (view: View) => void;
}) {
  const t = useTranslations("Mail");
  return (
    <div className="flex items-center gap-3 pr-10">
      {view.kind !== "inbox" ? (
        <button
          type="button"
          onClick={() => onView({ kind: "inbox" })}
          aria-label={t("back")}
          className="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-[18px]" />
        </button>
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Inbox className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15px] font-semibold">
            {view.kind === "manage" ? t("admin.title") : t("title")}
          </p>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {t("readOnly")}
          </span>
          <InfoTip text={t("readOnlyHint")} />
        </div>
        {email && view.kind !== "manage" && (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        )}
      </div>
      <a
        href={IONOS_WEBMAIL_URL}
        target="_blank"
        rel="noreferrer"
        title={t("webmail")}
        aria-label={t("webmail")}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ExternalLink className="size-4" />
      </a>
      {isAdmin && view.kind !== "manage" && (
        <button
          type="button"
          onClick={() => onView({ kind: "manage" })}
          title={t("manage")}
          aria-label={t("manage")}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function PanelBody({
  view,
  onView,
  connected,
  authFailed,
  isAdmin,
}: {
  view: View;
  onView: (view: View) => void;
  connected: boolean;
  authFailed: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("Mail");
  if (view.kind === "manage") return <AccountsAdmin />;
  if (!connected || authFailed) {
    return (
      <EmptyState
        inline
        className="py-16"
        icon={authFailed ? <MailWarning /> : <Mail />}
        title={authFailed ? t("authFailed") : t("notConnected")}
        description={authFailed ? t("authFailedHint") : t("notConnectedHint")}
        action={
          isAdmin && (
            <Button size="sm" variant="outline" onClick={() => onView({ kind: "manage" })}>
              <Settings2 className="size-4" />
              {t("manage")}
            </Button>
          )
        }
      />
    );
  }
  if (view.kind === "message") return <MessageView uid={view.uid} />;
  return <InboxList onOpen={(uid) => onView({ kind: "message", uid })} />;
}

function senderName(from: MailAddress | null | undefined, fallback: string): string {
  return from?.name || from?.address || fallback;
}

function shortDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "2-digit" }),
  });
}

function InboxList({ onOpen }: { onOpen: (uid: number) => void }) {
  const t = useTranslations("Mail");
  const locale = useLocale();
  const client = useIntranetApiClient();
  const inbox = useInbox(true);
  const [older, setOlder] = useState<InboxItem[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    // A refresh starts over from the newest page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOlder([]);
    setNextBefore(undefined);
  }, [inbox.data]);

  async function loadMore(before: number) {
    setLoadingMore(true);
    try {
      const page = await fetchInboxPage(client, before);
      setOlder((current) => [...current, ...page.items]);
      setNextBefore(page.nextBefore);
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }

  if (inbox.status === "error") {
    const authFailed = inbox.error instanceof ApiResponseError && inbox.error.code === "conflict";
    return (
      <EmptyState
        inline
        className="py-16"
        icon={<MailWarning />}
        title={authFailed ? t("authFailed") : t("loadFailed")}
        description={authFailed ? t("authFailedHint") : undefined}
        action={
          <Button size="sm" variant="outline" onClick={inbox.refresh}>
            <RefreshCw className="size-4" />
            {t("retry")}
          </Button>
        }
      />
    );
  }
  if (!inbox.data) {
    return (
      <div className="space-y-4 py-4">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  const items = [...inbox.data.items, ...older];
  const more = nextBefore === undefined ? inbox.data.nextBefore : nextBefore;
  if (items.length === 0) {
    return <EmptyState inline className="py-16" icon={<Inbox />} title={t("empty")} />;
  }

  return (
    <div className="-mx-5">
      <div className="flex items-center justify-between px-5 py-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{inbox.data.total}</span>
        <button
          type="button"
          onClick={inbox.refresh}
          disabled={inbox.status === "loading"}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", inbox.status === "loading" && "animate-spin")} />
          {t("refresh")}
        </button>
      </div>
      <ul className="divide-y divide-border/60 border-y border-border/60">
        {items.map((item) => (
          <li key={item.uid}>
            <button
              type="button"
              onClick={() => onOpen(item.uid)}
              className="flex w-full gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
            >
              <span
                aria-label={item.seen ? undefined : t("unread")}
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  item.seen ? "bg-transparent" : "bg-primary",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      item.seen ? "text-foreground/80" : "font-semibold",
                    )}
                  >
                    {senderName(item.from, t("unknownSender"))}
                  </span>
                  {item.hasAttachments && (
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {shortDate(item.date, locale)}
                  </span>
                </span>
                <span
                  className={cn(
                    "block truncate text-[12.5px]",
                    item.seen ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {item.subject || t("noSubject")}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {more && (
        <div className="flex justify-center py-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={loadingMore}
            onClick={() => void loadMore(more)}
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

function addressLine(list: MailAddress[]): string {
  return list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");
}

function MessageView({ uid }: { uid: number }) {
  const t = useTranslations("Mail");
  const locale = useLocale();
  const client = useIntranetApiClient();
  const message = useMailMessage(uid);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (message.status === "error") {
    return (
      <EmptyState
        inline
        className="py-16"
        icon={<MailWarning />}
        title={t("loadFailed")}
        action={
          <Button size="sm" variant="outline" onClick={message.refresh}>
            <RefreshCw className="size-4" />
            {t("retry")}
          </Button>
        }
      />
    );
  }
  const data = message.data;
  if (!data || data.uid !== uid) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  async function download(attachment: MailMessage["attachments"][number]) {
    setDownloading(attachment.part);
    try {
      await downloadMailAttachment(client, uid, attachment);
    } catch {
      toast.error(t("downloadFailed"));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 py-4">
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-snug">{data.subject || t("noSubject")}</h2>
        <dl className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12.5px]">
          <dt className="text-muted-foreground">{t("from")}</dt>
          <dd className="break-words">{addressLine(data.from) || t("unknownSender")}</dd>
          {data.to.length > 0 && (
            <>
              <dt className="text-muted-foreground">{t("to")}</dt>
              <dd className="break-words text-muted-foreground">{addressLine(data.to)}</dd>
            </>
          )}
          {data.cc.length > 0 && (
            <>
              <dt className="text-muted-foreground">{t("cc")}</dt>
              <dd className="break-words text-muted-foreground">{addressLine(data.cc)}</dd>
            </>
          )}
        </dl>
        {data.date && (
          <p className="text-[11.5px] text-muted-foreground">
            {new Date(data.date).toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}
          </p>
        )}
      </div>

      {data.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.attachments.map((attachment) => (
            <button
              key={attachment.part}
              type="button"
              onClick={() => void download(attachment)}
              disabled={downloading !== null}
              className="flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[12px] transition-colors hover:bg-accent disabled:opacity-60"
            >
              {downloading === attachment.part ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatSize(attachment.size)}
              </span>
            </button>
          ))}
        </div>
      )}

      {data.tooLarge ? (
        <EmptyState
          inline
          icon={<Mail />}
          title={t("tooLarge")}
          action={
            <Button size="sm" variant="outline" asChild>
              <a href={IONOS_WEBMAIL_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                {t("openInWebmail")}
              </a>
            </Button>
          }
        />
      ) : (
        <MailBody key={uid} html={data.html} text={data.text} />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const REMOTE_IMAGE = /<img[^>]+src\s*=\s*["']?https?:|url\(\s*["']?https?:/i;

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Untrusted mail HTML in a sandboxed frame: no scripts, an opaque origin (no
 * access to the intranet's cookies or DOM), links opening in a new tab, and a
 * CSP that blocks remote images until asked — they double as read receipts.
 */
function MailBody({ html, text }: { html: string | null; text: string | null }) {
  const t = useTranslations("Mail");
  const [allowImages, setAllowImages] = useState(false);
  const hasRemote = html !== null && REMOTE_IMAGE.test(html);
  const srcDoc = useMemo(() => {
    const body = html ?? `<pre class="plain">${escapeHtml(text ?? "")}</pre>`;
    const img = allowImages ? "data: cid: https: http:" : "data: cid:";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>html,body{margin:0;background:#fff;color:#1a1a1a}body{padding:14px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre.plain{white-space:pre-wrap;font:inherit;margin:0}a{color:#2563eb}</style></head><body>${body}</body></html>`;
  }, [html, text, allowImages]);

  return (
    <div className="flex min-h-[55vh] flex-1 flex-col gap-2">
      {hasRemote && !allowImages && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
          <ImageOff className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t("imagesBlocked")}</span>
          <button
            type="button"
            onClick={() => setAllowImages(true)}
            className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
          >
            {t("loadImages")}
          </button>
        </div>
      )}
      <iframe
        title={t("title")}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className="min-h-[55vh] w-full flex-1 rounded-lg border border-border/70 bg-white"
      />
    </div>
  );
}

type AdminRow = NonNullable<ReturnType<typeof useAdminRows>>[number];

function useAdminRows() {
  return useQuery(api.mail.accounts.adminList);
}

function AccountsAdmin() {
  const t = useTranslations("Mail");
  const rows = useAdminRows();
  const confirm = useConfirm();
  const remove = useSave(api.mail.accounts.removeAccount);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminRow | null>(null);

  const visible = rows?.filter((r) => matchesSearch(search, r.name, r.loginEmail, r.mailEmail));

  async function disconnect(row: AdminRow) {
    const ok = await confirm({
      title: t("admin.removeTitle", { name: row.name }),
      description: t("admin.removeBody"),
      details: [{ label: t("admin.email"), value: row.mailEmail ?? "" }],
      confirmLabel: t("admin.remove"),
      destructive: true,
    });
    if (ok) await remove({ userId: row.userId }, { success: t("admin.removed") });
  }

  return (
    <div className="space-y-3 py-4">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("admin.hint")}</p>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("admin.search")}
        className="h-9"
      />
      {visible === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="-mx-5 divide-y divide-border/60 border-y border-border/60">
          {visible.map((row) => {
            const state = !row.mailEmail
              ? "none"
              : row.error
                ? row.error
                : row.checkedAt
                  ? "ok"
                  : "pending";
            return (
              <li key={row.userId} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{row.name}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {row.mailEmail ?? row.loginEmail}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium",
                    state === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                    (state === "auth" || state === "connect") &&
                      "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                    (state === "none" || state === "pending") && "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`admin.status_${state}`)}
                </span>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setEditing(row)}>
                  <KeyRound className="size-3.5" />
                  {row.mailEmail ? t("admin.change") : t("admin.set")}
                </Button>
                {row.mailEmail && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground"
                    onClick={() => void disconnect(row)}
                  >
                    {t("admin.remove")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <AccountDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountDialog({ row, onClose }: { row: AdminRow; onClose: () => void }) {
  const t = useTranslations("Mail");
  const client = useIntranetApiClient();
  const [email, setEmail] = useState(
    row.mailEmail ?? (row.loginEmail.endsWith("@advantisgroup.de") ? row.loginEmail : ""),
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setMailAccount(client, row.userId, { email, password });
      toast.success(t("admin.saved"));
      onClose();
    } catch (err) {
      if (err instanceof ApiResponseError && err.code === "bad_request") {
        setError(t("admin.rejected"));
      } else {
        // Admin-only dialog: the cause is what's needed to fix it.
        const cause =
          err instanceof ApiResponseError
            ? [err.serverMessage ?? err.code, err.requestId && `ID ${err.requestId}`]
                .filter(Boolean)
                .join(" · ")
            : err instanceof Error
              ? err.message
              : String(err);
        setError(`${t("admin.failed")}: ${cause}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("admin.dialogTitle", { name: row.name })}
      description={t("admin.dialogHint")}
      footer={
        <Button onClick={() => void save()} disabled={saving || !email || !password}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("admin.save")}
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (email && password) void save();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="mail-email">{t("admin.email")}</Label>
          <Input
            id="mail-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mail-password">{t("admin.password")}</Label>
          <Input
            id="mail-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </ResponsiveDialog>
  );
}
