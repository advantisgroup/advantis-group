"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
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

function CreateCompanyDialog({
  open,
  onOpenChange,
  token,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  prefill: { name: string; slug: string } | null;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const createCompany = useAction(api.companies.createCompany);
  const [name, setName] = useState(prefill?.name ?? "");
  const [slug, setSlug] = useState(prefill?.slug ?? "");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    status: "active" | "failed";
    subdomain: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setName(prefill?.name ?? "");
      setSlug(prefill?.slug ?? "");
      setEmails("");
      setResult(null);
    }
  }, [open, prefill]);

  const canSave = !!name.trim() && !!slug.trim();

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await createCompany({
        token,
        name: name.trim(),
        slug: slug.trim(),
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
              {t("companySlugLabel")}
            </label>
            <Input
              value={slug}
              onChange={e =>
                setSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                )
              }
              placeholder="acme"
            />
            <p className="text-xs text-muted-foreground">
              {t("companySlugHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("companyAdminEmailsLabel")}
            </label>
            <Input
              value={emails}
              onChange={e => setEmails(e.target.value)}
              placeholder="admin@acme.com, lead@acme.com"
            />
            <p className="text-xs text-muted-foreground">
              {t("companyAdminEmailsHint")}
            </p>
          </div>
          {result && (
            <p
              className={
                result.status === "active"
                  ? "text-sm text-emerald-600"
                  : "text-sm text-destructive"
              }
            >
              {result.status === "active"
                ? t("companyProvisionedSuccess", { subdomain: result.subdomain })
                : (result.error ?? t("companyProvisionedFailed"))}
            </p>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 mt-0 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || !canSave}>
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
  const [creating, setCreating] = useState(false);
  const [retrying, setRetrying] = useState<{ name: string; slug: string } | null>(
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
                    <TableHead>{t("companySubdomainLabel")}</TableHead>
                    <TableHead>{t("companyStatusLabel")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.subdomain}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            c.status === "active"
                              ? "success"
                              : c.status === "failed"
                                ? "destructive"
                                : "muted"
                          }
                        >
                          {t(`companyStatus_${c.status}`)}
                        </Badge>
                        {c.status === "failed" && c.provisioningError && (
                          <p className="mt-1 max-w-xs truncate text-xs text-destructive">
                            {c.provisioningError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRetrying({ name: c.name, slug: c.slug });
                              setCreating(true);
                            }}
                          >
                            <RotateCw className="mr-2 h-3.5 w-3.5" />
                            {t("companyRetry")}
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
