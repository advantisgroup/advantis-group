"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction, useQuery } from "convex/react";
import { Building2, Plus, RotateCw } from "lucide-react";
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

interface DnsRecord {
  type: string;
  domain: string;
  value: string;
}

function DnsInstructions({ records }: { records: DnsRecord[] }) {
  const t = useTranslations("Performance");
  if (records.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
      <p className="font-medium text-amber-700 dark:text-amber-400">
        {t("companyDnsInstructions")}
      </p>
      {records.map((r, i) => (
        <div key={i} className="grid grid-cols-[3rem_1fr] gap-x-2 font-mono">
          <span className="text-muted-foreground">{r.type}</span>
          <span className="truncate">{r.domain}</span>
          <span />
          <span className="truncate text-muted-foreground">{r.value}</span>
        </div>
      ))}
    </div>
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
  const createCompany = useAction(api.companies.createCompany);
  const [name, setName] = useState(prefill?.name ?? "");
  const [domain, setDomain] = useState(prefill?.domain ?? "");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    status: "active" | "pending_dns" | "failed";
    dnsVerification: DnsRecord[];
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
                    : result.status === "pending_dns"
                      ? "text-sm text-amber-600 dark:text-amber-400"
                      : "text-sm text-destructive"
                }
              >
                {result.status === "active"
                  ? t("companyProvisionedSuccess")
                  : result.status === "pending_dns"
                    ? t("companyProvisionedPendingDns")
                    : (result.error ?? t("companyProvisionedFailed"))}
              </p>
              <DnsInstructions records={result.dnsVerification} />
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
          <CardContent className="overflow-x-auto">
            {companies === undefined ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("companiesEmpty")}
              </p>
            ) : (
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
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.domain}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <Badge
                          variant={
                            c.status === "active"
                              ? "success"
                              : c.status === "failed"
                                ? "destructive"
                                : c.status === "pending_dns"
                                  ? "warning"
                                  : "muted"
                          }
                        >
                          {t(`companyStatus_${c.status}`)}
                        </Badge>
                        {c.status === "failed" && c.provisioningError && (
                          <p className="mt-1 truncate text-xs text-destructive">
                            {c.provisioningError}
                          </p>
                        )}
                        {c.status === "pending_dns" && c.dnsVerification && (
                          <div className="mt-2">
                            <DnsInstructions records={c.dnsVerification} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRetrying({ name: c.name, domain: c.domain });
                              setCreating(true);
                            }}
                          >
                            <RotateCw className="mr-2 h-3.5 w-3.5" />
                            {t("companyRetry")}
                          </Button>
                        )}
                        {c.status === "pending_dns" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={checking === c.id}
                            onClick={() => void handleCheck(c.id)}
                          >
                            <RotateCw className="mr-2 h-3.5 w-3.5" />
                            {t("companyCheckVerification")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
      <PerformanceBottomTabs
        navItems={navItems}
        onExit={session.viaClerk ? undefined : exit}
      />
    </div>
  );
}
