"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { ActionMenu } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Platform-level: creating a company is inherently a cross-company action,
// so this page (unlike the rest of Performance) is isSuperAdmin-only, not
// gated on a per-company permission.

type CompanyStatus = "provisioning" | "pending_dns" | "pending_routing" | "active" | "failed";

interface DnsRecord {
  type: string;
  domain?: string;
  value: string;
}

interface DnsProvider {
  name: string;
  docsUrl: string;
}

interface CompanyRow {
  id: Id<"companies">;
  name: string;
  slug: string;
  domain: string;
  status: CompanyStatus;
  adminBootstrapEmails: string[];
  dnsVerification: DnsRecord[] | null;
  dnsRouting: DnsRecord[] | null;
  dnsProvider: DnsProvider | null;
  provisioningError: string | null;
}

/** The provider's own favicon, derived from the docs URL's hostname —
 * avoids bundling/maintaining actual brand logo assets ourselves (a
 * trademark gray area) in favor of the same lightweight attribution
 * pattern browsers and link previews already use: fetch the provider's own
 * live icon from their own site rather than approximating their mark.
 * Returns `null` for a malformed URL; the caller just omits the icon. */
function providerFaviconUrl(docsUrl: string): string | null {
  try {
    const host = new URL(docsUrl).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

/** Renders nothing if the favicon fails to load (same graceful-omit
 * approach as `ProviderMark`'s logo fallback) — the text label alongside
 * it already identifies the provider either way. */
function ProviderFavicon({ provider }: { provider: DnsProvider }) {
  const src = providerFaviconUrl(provider.docsUrl);
  const [failed, setFailed] = useState(!src);
  if (failed || !src) return null;
  return (
    <img src={src} alt="" className="h-4 w-4 shrink-0 rounded-sm" onError={() => setFailed(true)} />
  );
}

/** Always-visible "DNS managed by X" line — unlike `DnsInstructions` (which
 * only makes sense while a record still needs adding), this has nothing to
 * do with the company's current status: the provider is detected fresh on
 * every `createCompany`/`checkDomainVerification` call and kept regardless
 * of whether the domain is still pending or already `active`, so it's the
 * one place `dnsProvider` should always render if present. */
function DnsProviderNote({ provider }: { provider: DnsProvider }) {
  const t = useTranslations("Performance");
  return (
    <a
      href={provider.docsUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      <ProviderFavicon provider={provider} />
      {t("companyDnsProviderDetected", { provider: provider.name })}
    </a>
  );
}

/** A single copyable DNS field — full value always visible (wraps instead of
 * truncating, since a truncated TXT value is unreadable and unselectable on
 * mobile) with a tap target to copy it instead of relying on manual
 * text selection, which is fiddly on a phone. */
function CopyableField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("Performance");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (insecure context, permissions) —
      // the value is still fully visible and selectable, so this is a
      // graceful no-op, not an error worth surfacing.
    }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="min-w-0 flex-1 break-all font-mono text-xs">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        onClick={() => void handleCopy()}
        aria-label={copied ? t("companyDnsCopied") : t("companyDnsCopy")}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** One DNS record, laid out as the three fields every registrar's "add
 * record" form actually asks for — Type, Host/Name, and Value — instead of
 * a bare type + value pair. A record with no `domain` of its own (the
 * routing step's CNAME/A: Vercel's config API returns those without a host,
 * because it's always the company's own root domain) falls back to `@`,
 * the near-universal registrar shorthand for "the domain itself, no
 * subdomain" — spelling that out is what was missing before, since a CNAME
 * is meaningless without knowing which host it's being added *to*. */
function DnsRecordField({ record, companyDomain }: { record: DnsRecord; companyDomain: string }) {
  const t = useTranslations("Performance");
  const host = record.domain && record.domain.length > 0 ? record.domain : "@";
  return (
    <div className="space-y-2.5 rounded border border-amber-500/20 bg-background/40 p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">{t("companyDnsFieldType")}</dt>
        <dd className="font-mono">{record.type}</dd>
        <dt className="text-muted-foreground">{t("companyDnsFieldHost")}</dt>
        <dd className="break-all font-mono">{host}</dd>
        <dt className="text-muted-foreground">{t("companyDnsFieldValue")}</dt>
        <dd />
      </dl>
      <CopyableField label={`${record.type} ${host}`} value={record.value} />
      {host === "@" && (
        <p className="leading-relaxed text-muted-foreground">
          {t("companyDnsRootHint", { domain: companyDomain })}
        </p>
      )}
    </div>
  );
}

/** Shared renderer for both DNS steps — ownership verification (`records`
 * carry the exact `domain` Vercel expects the record on) and routing (no
 * per-record `domain`; `DnsRecordField` falls back to `@`, the company's own
 * root domain). `title` distinguishes which step this is, since showing the
 * wrong instructions at the wrong time is exactly what let a company look
 * "active" while still not resolving at all. */
function DnsInstructions({
  title,
  domain,
  records,
  provider,
}: {
  title: string;
  domain: string;
  records: DnsRecord[];
  provider?: DnsProvider | null;
}) {
  const t = useTranslations("Performance");
  if (records.length === 0) return null;
  return (
    <div className="space-y-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
      <p className="font-medium leading-relaxed text-amber-700 dark:text-amber-400">{title}</p>
      <div className="space-y-3">
        {records.map((r, i) => (
          <DnsRecordField key={i} record={r} companyDomain={domain} />
        ))}
      </div>
      {provider && (
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-1.5 leading-relaxed text-amber-700 underline underline-offset-2 dark:text-amber-400"
        >
          <ProviderFavicon provider={provider} />
          <span>{t("companyDnsProviderHint", { provider: provider.name })}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      )}
    </div>
  );
}

/** The two DNS-related blocks a company in `pending_dns`/`pending_routing`
 * needs shown, keyed off its current status. Only ever rendered inside
 * `CompanyStatusBadge`'s popover now — never inline in a row or dialog,
 * which is what made either one blow up in height. */
function CompanyDnsStatus({
  domain,
  status,
  dnsVerification,
  dnsRouting,
  dnsProvider,
}: {
  domain: string;
  status: CompanyStatus;
  dnsVerification: DnsRecord[] | null;
  dnsRouting: DnsRecord[] | null;
  dnsProvider: DnsProvider | null;
}) {
  const t = useTranslations("Performance");
  if (status === "pending_dns" && dnsVerification) {
    return (
      <DnsInstructions
        title={t("companyDnsInstructions")}
        domain={domain}
        records={dnsVerification}
        provider={dnsProvider}
      />
    );
  }
  if (status === "pending_routing" && dnsRouting) {
    return (
      <DnsInstructions
        title={t("companyDnsRoutingInstructions")}
        domain={domain}
        records={dnsRouting}
        provider={dnsProvider}
      />
    );
  }
  return null;
}

function statusBadgeVariant(
  status: CompanyStatus,
): "success" | "destructive" | "warning" | "muted" {
  if (status === "active") return "success";
  if (status === "failed") return "destructive";
  if (status === "pending_dns" || status === "pending_routing") return "warning";
  return "muted";
}

/** The status badge, plus — only while there's an actual DNS record still
 * needed — a click-to-open popover with the record itself (mirrors
 * Vercel's own "Invalid Configuration" row: a compact badge everywhere the
 * company is listed, never the record dumped inline). Replaces having
 * `CompanyDnsStatus`'s full instructions block permanently expanded in
 * every row, which is what blew up row height for anything not yet
 * routing. A row with nothing to add (active, provisioning, failed) just
 * renders the plain badge. */
function CompanyStatusBadge({
  domain,
  status,
  dnsVerification,
  dnsRouting,
  dnsProvider,
}: {
  domain: string;
  status: CompanyStatus;
  dnsVerification: DnsRecord[] | null;
  dnsRouting: DnsRecord[] | null;
  dnsProvider: DnsProvider | null;
}) {
  const t = useTranslations("Performance");
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasDetails =
    (status === "pending_dns" && !!dnsVerification?.length) ||
    (status === "pending_routing" && !!dnsRouting?.length);

  const badge = (
    <Badge variant={statusBadgeVariant(status)}>
      {t(`companyStatus_${status}`)}
      {hasDetails && <ChevronDown className="h-3 w-3" />}
    </Badge>
  );

  if (!hasDetails) return badge;

  // Mobile: a fixed-width popover has nowhere good to anchor next to a
  // table row and ends up clipped/overlapping neighboring rows (a floating
  // panel pinned near the tap target rather than a proper sheet). The
  // existing bottom-sheet drawer used for the sidebar gives the same
  // content room to breathe full-width instead.
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {badge}
        </button>
        <MobileDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          ariaLabel={t(`companyStatus_${status}`)}
        >
          <div className="p-4">
            <CompanyDnsStatus
              domain={domain}
              status={status}
              dnsVerification={dnsVerification}
              dnsRouting={dnsRouting}
              dnsProvider={dnsProvider}
            />
          </div>
        </MobileDrawer>
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <CompanyDnsStatus
          domain={domain}
          status={status}
          dnsVerification={dnsVerification}
          dnsRouting={dnsRouting}
          dnsProvider={dnsProvider}
        />
      </PopoverContent>
    </Popover>
  );
}

function CreateCompanyDialog({
  open,
  onOpenChange,
  token,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  prefill: { name: string; domain: string } | null;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const createCompany = useAction(api.performance.companies.createCompany);
  const [name, setName] = useState(prefill?.name ?? "");
  const [domain, setDomain] = useState(prefill?.domain ?? "");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(prefill?.name ?? "");
      setDomain(prefill?.domain ?? "");
      setEmails("");
    }
  }, [open, prefill]);

  const canSave = !!name.trim() && !!domain.trim();

  // Whatever comes back — active, still waiting on a DNS record, or a
  // provisioning failure — is a normal, non-throwing outcome that already
  // shows up on the company's own row the moment this closes (status
  // badge, and its popover for any DNS record still needed). Nothing
  // about that belongs duplicated inside the dialog itself; only an
  // actual thrown error (bad input, session issue) keeps it open so the
  // form can be corrected and resubmitted.
  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await createCompany({
        token,
        name: name.trim(),
        domain: domain.trim(),
        adminBootstrapEmails: emails
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean),
      });
      onOpenChange(false);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("companyNewTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !canSave}>
            {t("companyCreateSubmit")}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("companyNameLabel")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("companyDomainLabel")}
        </label>
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value.trim().toLowerCase())}
          placeholder="salespirates.de"
        />
        <p className="text-xs text-muted-foreground">{t("companyDomainHint")}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("companyAdminEmailsLabel")}
        </label>
        <Input
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="admin@salespirates.de, lead@salespirates.de"
        />
        <p className="text-xs text-muted-foreground">{t("companyAdminEmailsHint")}</p>
      </div>
    </ResponsiveDialog>
  );
}

function EditCompanyDialog({
  open,
  onOpenChange,
  token,
  company,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  company: CompanyRow | null;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const updateCompany = useMutation(api.performance.companies.updateCompany);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && company) {
      setName(company.name);
      setEmails(company.adminBootstrapEmails.join(", "));
    }
  }, [open, company]);

  const canSave = !!name.trim();

  async function handleSave() {
    if (!company || !canSave) return;
    setSaving(true);
    try {
      await updateCompany({
        token,
        companyId: company.id,
        name: name.trim(),
        adminBootstrapEmails: emails
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean),
      });
      onOpenChange(false);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("companyEditTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !canSave}>
            {t("companySaveChanges")}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("companyNameLabel")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {t("companyAdminEmailsLabel")}
        </label>
        <Input value={emails} onChange={(e) => setEmails(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("companyAdminEmailsHint")}</p>
      </div>
    </ResponsiveDialog>
  );
}

function CompanyActions({
  company,
  checking,
  onRetry,
  onCheck,
  onEdit,
  onDelete,
}: {
  company: CompanyRow;
  checking: boolean;
  onRetry: () => void;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Performance");
  return (
    <div className="flex items-center justify-end gap-1">
      {company.status === "failed" && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="mr-2 h-3.5 w-3.5" />
          {t("companyRetry")}
        </Button>
      )}
      {(company.status === "pending_dns" || company.status === "pending_routing") && (
        <Button variant="outline" size="sm" disabled={checking} onClick={onCheck}>
          <RotateCw className={cn("mr-2 h-3.5 w-3.5", checking && "animate-spin")} />
          {t("companyCheckVerification")}
        </Button>
      )}
      <ActionMenu
        ariaLabel={t("rowActions")}
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label={t("rowActions")}>
            <MoreHorizontal />
          </Button>
        }
        items={[
          { key: "edit", label: t("companyEdit"), icon: <Pencil />, onSelect: onEdit },
          ...(company.slug !== "advantis"
            ? [
                { key: "sep", separator: true as const },
                {
                  key: "delete",
                  label: t("companyDelete"),
                  icon: <Trash2 />,
                  onSelect: onDelete,
                  destructive: true,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

export default function PerformanceCompaniesAdminPage() {
  const t = useTranslations("Performance");
  const tc = useTranslations("Common");
  const { token, session } = usePerformanceSession();
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const checkDomainVerification = useAction(api.performance.companies.checkDomainVerification);
  const deleteCompany = useAction(api.performance.companies.deleteCompany);
  const [creating, setCreating] = useState(false);
  const [retrying, setRetrying] = useState<{
    name: string;
    domain: string;
  } | null>(null);
  const [checking, setChecking] = useState<Id<"companies"> | null>(null);
  const [editing, setEditing] = useState<CompanyRow | null>(null);

  // Gated on isSuperAdmin by the parent layout — always true by the time
  // this page is mounted.
  const isSuperAdmin = session?.valid && session.isSuperAdmin;
  const companies = useQuery(
    api.performance.companies.listCompanies,
    isSuperAdmin ? { token } : "skip",
  );

  async function handleCheck(companyId: Id<"companies">) {
    setChecking(companyId);
    try {
      await checkDomainVerification({ token, companyId });
    } catch (err) {
      handleError(err);
    } finally {
      setChecking(null);
    }
  }

  async function handleDelete(company: CompanyRow) {
    const ok = await confirm({
      title: t("companyDeleteTitle"),
      description: t("companyDeleteWarning", { name: company.name }),
      details: [{ label: tc("fieldName"), value: company.name }],
      confirmLabel: t("companyDeleteConfirm"),
      cancelLabel: t("topicCancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteCompany({ token, companyId: company.id });
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setRetrying(null);
              setCreating(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("companyNew")}
          </Button>
        </div>
        {companies === undefined ? (
          <SkeletonRows className="py-2" />
        ) : companies.length === 0 ? (
          <Card>
            <EmptyState inline title={t("companiesEmpty")} />
          </Card>
        ) : (
          <>
            {/* Mobile: one card per company — a 4-column table with DNS
                    instructions crammed into one cell doesn't fit a phone
                    (columns overlapped/cut off in practice). */}
            <div className="space-y-2 md:hidden">
              {companies.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.domain}</p>
                        {c.dnsProvider && <DnsProviderNote provider={c.dnsProvider} />}
                      </div>
                      <div className="shrink-0">
                        <CompanyStatusBadge
                          domain={c.domain}
                          status={c.status}
                          dnsVerification={c.dnsVerification}
                          dnsRouting={c.dnsRouting}
                          dnsProvider={c.dnsProvider}
                        />
                      </div>
                    </div>
                    {c.status === "failed" && c.provisioningError && (
                      <p className="text-xs text-destructive">{c.provisioningError}</p>
                    )}
                    <div className="border-t border-border-soft pt-3">
                      <CompanyActions
                        company={c}
                        checking={checking === c.id}
                        onRetry={() => {
                          setRetrying({ name: c.name, domain: c.domain });
                          setCreating(true);
                        }}
                        onCheck={() => void handleCheck(c.id)}
                        onEdit={() => setEditing(c)}
                        onDelete={() => void handleDelete(c)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("companyNameLabel")}</TableHead>
                    <TableHead>{t("companyDomainLabel")}</TableHead>
                    <TableHead>{t("companyStatusLabel")}</TableHead>
                    <TableHead className="text-right">{t("rowActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.domain}
                        {c.dnsProvider && (
                          <div className="mt-1">
                            <DnsProviderNote provider={c.dnsProvider} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <CompanyStatusBadge
                          domain={c.domain}
                          status={c.status}
                          dnsVerification={c.dnsVerification}
                          dnsRouting={c.dnsRouting}
                          dnsProvider={c.dnsProvider}
                        />
                        {c.status === "failed" && c.provisioningError && (
                          <p className="mt-1 truncate text-xs text-destructive">
                            {c.provisioningError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <CompanyActions
                          company={c}
                          checking={checking === c.id}
                          onRetry={() => {
                            setRetrying({
                              name: c.name,
                              domain: c.domain,
                            });
                            setCreating(true);
                          }}
                          onCheck={() => void handleCheck(c.id)}
                          onEdit={() => setEditing(c)}
                          onDelete={() => void handleDelete(c)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
      <CreateCompanyDialog
        open={creating}
        onOpenChange={setCreating}
        token={token}
        prefill={retrying}
      />
      <EditCompanyDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        token={token}
        company={editing}
      />
    </>
  );
}
