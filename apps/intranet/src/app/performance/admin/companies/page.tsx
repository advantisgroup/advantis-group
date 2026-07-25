"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { PerformanceBottomTabs } from "@/components/performance/PerformanceBottomTabs";
import { PerformanceHeader } from "@/components/performance/PerformanceHeader";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { usePerformanceSession } from "@/components/performance/usePerformanceSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { clearPerformanceToken } from "@/lib/performanceAuth";

// Platform-level: creating a company is inherently a cross-company action,
// so this page (unlike the rest of Performance) is isSuperAdmin-only, not
// gated on a per-company permission.

type CompanyStatus =
  | "provisioning"
  | "pending_dns"
  | "pending_routing"
  | "active"
  | "failed";

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
    <img
      src={src}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
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
      <span className="min-w-0 flex-1 break-all font-mono text-xs">
        {value}
      </span>
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

/** Shared renderer for both DNS steps — ownership verification (`records`
 * carry the exact `domain` Vercel expects the record on) and routing
 * (no per-record `domain`; it's always the company's own domain, already
 * named by the surrounding UI). `title` distinguishes which step this is,
 * since showing the wrong instructions at the wrong time is exactly what
 * let a company look "active" while still not resolving at all. */
function DnsInstructions({
  title,
  records,
  provider,
}: {
  title: string;
  records: DnsRecord[];
  provider?: DnsProvider | null;
}) {
  const t = useTranslations("Performance");
  if (records.length === 0) return null;
  return (
    <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
      <p className="font-medium text-amber-700 dark:text-amber-400">{title}</p>
      {records.map((r, i) => (
        <div key={i} className="space-y-1 font-mono">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>{r.type}</span>
            {r.domain && <span className="break-all">{r.domain}</span>}
          </div>
          <CopyableField
            label={`${r.type} ${r.domain ?? ""}`}
            value={r.value}
          />
        </div>
      ))}
      {provider && (
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-amber-700 underline underline-offset-2 dark:text-amber-400"
        >
          <ProviderFavicon provider={provider} />
          {t("companyDnsProviderHint", { provider: provider.name })}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      )}
    </div>
  );
}

/** The two DNS-related blocks a company in `pending_dns`/`pending_routing`
 * needs shown, keyed off its current status — factored out since both the
 * create-dialog result and each list row need the identical logic. */
function CompanyDnsStatus({
  status,
  dnsVerification,
  dnsRouting,
  dnsProvider,
}: {
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
        records={dnsVerification}
        provider={dnsProvider}
      />
    );
  }
  if (status === "pending_routing" && dnsRouting) {
    return (
      <DnsInstructions
        title={t("companyDnsRoutingInstructions")}
        records={dnsRouting}
        provider={dnsProvider}
      />
    );
  }
  return null;
}

function statusBadgeVariant(
  status: CompanyStatus
): "success" | "destructive" | "warning" | "muted" {
  if (status === "active") return "success";
  if (status === "failed") return "destructive";
  if (status === "pending_dns" || status === "pending_routing")
    return "warning";
  return "muted";
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
  const createCompany = useAction(api.companies.createCompany);
  const [name, setName] = useState(prefill?.name ?? "");
  const [domain, setDomain] = useState(prefill?.domain ?? "");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    status: CompanyStatus | "failed";
    dnsVerification: DnsRecord[];
    dnsRouting: DnsRecord[];
    dnsProvider: DnsProvider | null;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setName(prefill?.name ?? "");
      setDomain(prefill?.domain ?? "");
      setEmails("");
      setResult(null);
    }
  }, [open, prefill]);

  const canSave = !!name.trim() && !!domain.trim();

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await createCompany({
        token,
        name: name.trim(),
        domain: domain.trim(),
        adminBootstrapEmails: emails
          .split(/[,;\s]+/)
          .map(e => e.trim())
          .filter(Boolean),
      });
      setResult(res);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {t("companyNewTitle")}
          </DialogTitle>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("companyNameLabel")}
            </label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("companyDomainLabel")}
            </label>
            <Input
              value={domain}
              onChange={e => setDomain(e.target.value.trim().toLowerCase())}
              placeholder="salespirates.de"
            />
            <p className="text-xs text-muted-foreground">
              {t("companyDomainHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("companyAdminEmailsLabel")}
            </label>
            <Input
              value={emails}
              onChange={e => setEmails(e.target.value)}
              placeholder="admin@salespirates.de, lead@salespirates.de"
            />
            <p className="text-xs text-muted-foreground">
              {t("companyAdminEmailsHint")}
            </p>
          </div>
          {result && (
            <>
              <p
                className={
                  result.status === "active"
                    ? "text-sm text-emerald-600"
                    : result.status === "pending_dns" ||
                        result.status === "pending_routing"
                      ? "text-sm text-amber-600 dark:text-amber-400"
                      : "text-sm text-destructive"
                }
              >
                {result.status === "active"
                  ? t("companyProvisionedSuccess")
                  : result.status === "pending_dns"
                    ? t("companyProvisionedPendingDns")
                    : result.status === "pending_routing"
                      ? t("companyProvisionedPendingRouting")
                      : (result.error ?? t("companyProvisionedFailed"))}
              </p>
              {result.dnsProvider && (
                <DnsProviderNote provider={result.dnsProvider} />
              )}
              <CompanyDnsStatus
                status={result.status}
                dnsVerification={result.dnsVerification}
                dnsRouting={result.dnsRouting}
                dnsProvider={result.dnsProvider}
              />
            </>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
          >
            {t("companyCreateSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const updateCompany = useMutation(api.companies.updateCompany);
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
          .map(e => e.trim())
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-4 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {t("companyEditTitle")}
          </DialogTitle>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("companyNameLabel")}
            </label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("companyAdminEmailsLabel")}
            </label>
            <Input value={emails} onChange={e => setEmails(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {t("companyAdminEmailsHint")}
            </p>
          </div>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
          >
            {t("companySaveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCompanyDialog({
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
  const deleteCompany = useAction(api.companies.deleteCompany);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!company) return;
    setDeleting(true);
    try {
      await deleteCompany({ token, companyId: company.id });
      onOpenChange(false);
    } catch (err) {
      handleError(err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="space-y-3 px-6 pb-5 pt-6 pr-12">
          <DialogTitle className="leading-snug">
            {t("companyDeleteTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("companyDeleteWarning", { name: company?.name ?? "" })}
          </p>
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            {t("companyDeleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <div className="flex flex-wrap items-center justify-end gap-1">
      {company.status === "failed" && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCw className="mr-2 h-3.5 w-3.5" />
          {t("companyRetry")}
        </Button>
      )}
      {(company.status === "pending_dns" ||
        company.status === "pending_routing") && (
        <Button variant="ghost" size="sm" disabled={checking} onClick={onCheck}>
          <RotateCw className="mr-2 h-3.5 w-3.5" />
          {t("companyCheckVerification")}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="mr-2 h-3.5 w-3.5" />
        {t("companyEdit")}
      </Button>
      {company.slug !== "advantis" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {t("companyDelete")}
        </Button>
      )}
    </div>
  );
}

export default function PerformanceCompaniesAdminPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const { token, session } = usePerformanceSession();
  const handleError = useErrorHandler();
  const checkDomainVerification = useAction(
    api.companies.checkDomainVerification
  );
  const [creating, setCreating] = useState(false);
  const [retrying, setRetrying] = useState<{
    name: string;
    domain: string;
  } | null>(null);
  const [checking, setChecking] = useState<Id<"companies"> | null>(null);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<CompanyRow | null>(
    null
  );

  useEffect(() => {
    if (!session) return;
    if (!session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
      return;
    }
    if (!session.isSuperAdmin) router.replace("/performance");
  }, [session, router]);

  const isSuperAdmin = session?.valid && session.isSuperAdmin;
  const companies = useQuery(
    api.companies.listCompanies,
    isSuperAdmin ? { token } : "skip"
  );

  function exit() {
    clearPerformanceToken();
    router.replace("/performance/login");
  }

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

  if (session === undefined) return <PerformancePageSkeleton />;
  if (!session.valid || !session.isSuperAdmin) return null;

  const navItems = [{ href: "/performance", label: t("backToDashboard") }];

  return (
    <div className="min-h-screen bg-muted/20">
      <PerformanceHeader
        navItems={navItems}
        onExit={session.viaClerk ? undefined : exit}
      />
      <main className="mx-auto max-w-4xl space-y-6 p-4 pb-24 md:p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                {t("companiesTitle")}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("companiesIntro")}
              </p>
            </div>
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
          </CardHeader>
          <CardContent>
            {companies === undefined ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("companiesEmpty")}
              </p>
            ) : (
              <>
                {/* Mobile: one card per company — a 4-column table with DNS
                    instructions crammed into one cell doesn't fit a phone
                    (columns overlapped/cut off in practice). */}
                <div className="space-y-3 md:hidden">
                  {companies.map(c => (
                    <Card key={c.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.domain}
                            </p>
                            {c.dnsProvider && (
                              <DnsProviderNote provider={c.dnsProvider} />
                            )}
                          </div>
                          <Badge
                            variant={statusBadgeVariant(c.status)}
                            className="shrink-0"
                          >
                            {t(`companyStatus_${c.status}`)}
                          </Badge>
                        </div>
                        {c.status === "failed" && c.provisioningError && (
                          <p className="text-xs text-destructive">
                            {c.provisioningError}
                          </p>
                        )}
                        <CompanyDnsStatus
                          status={c.status}
                          dnsVerification={c.dnsVerification}
                          dnsRouting={c.dnsRouting}
                          dnsProvider={c.dnsProvider}
                        />
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
                            onDelete={() => setDeletingCompany(c)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("companyNameLabel")}</TableHead>
                        <TableHead>{t("companyDomainLabel")}</TableHead>
                        <TableHead>{t("companyStatusLabel")}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.domain}
                            {c.dnsProvider && (
                              <div className="mt-1">
                                <DnsProviderNote provider={c.dnsProvider} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <Badge variant={statusBadgeVariant(c.status)}>
                              {t(`companyStatus_${c.status}`)}
                            </Badge>
                            {c.status === "failed" && c.provisioningError && (
                              <p className="mt-1 truncate text-xs text-destructive">
                                {c.provisioningError}
                              </p>
                            )}
                            <div className="mt-2">
                              <CompanyDnsStatus
                                status={c.status}
                                dnsVerification={c.dnsVerification}
                                dnsRouting={c.dnsRouting}
                                dnsProvider={c.dnsProvider}
                              />
                            </div>
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
                              onDelete={() => setDeletingCompany(c)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <CreateCompanyDialog
        open={creating}
        onOpenChange={setCreating}
        token={token}
        prefill={retrying}
      />
      <EditCompanyDialog
        open={editing !== null}
        onOpenChange={open => {
          if (!open) setEditing(null);
        }}
        token={token}
        company={editing}
      />
      <DeleteCompanyDialog
        open={deletingCompany !== null}
        onOpenChange={open => {
          if (!open) setDeletingCompany(null);
        }}
        token={token}
        company={deletingCompany}
      />
      <PerformanceBottomTabs
        navItems={navItems}
        onExit={session.viaClerk ? undefined : exit}
      />
    </div>
  );
}
