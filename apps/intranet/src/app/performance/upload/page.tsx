"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { LogOut, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { PerformanceWordmark } from "@/components/performance/PerformanceBrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import {
  clearPerformanceToken,
  getPerformanceToken,
} from "@/lib/performanceAuth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  "http://localhost:3002";

interface UploadOutcome {
  filename: string;
  status: "ok" | "empty" | "error";
  message?: string;
  rowsImported?: number;
  skipped?: string[];
}

export default function PerformanceUploadPage() {
  const t = useTranslations("Performance");
  const locale = useLocale();
  const router = useRouter();
  const [token] = useState<string | null>(() => getPerformanceToken());

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );

  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

  useEffect(() => {
    if (session?.valid && session.role !== "admin")
      router.replace("/performance");
  }, [session, router]);

  const isAdmin = session?.valid && session.role === "admin";
  const log = useQuery(
    api.performanceImport.listUploadLog,
    token && isAdmin ? { token } : "skip"
  );

  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadOutcome[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !token) return;
    setUploading(true);
    setResults([]);
    const outcomes: UploadOutcome[] = [];
    for (const file of Array.from(files)) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_BASE}/performance/uploads`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        });
        const responseBody = (await res.json()) as {
          error?: string;
          status?: "ok" | "empty";
          rowsImported?: number;
          skipped?: string[];
        };
        if (!res.ok) {
          outcomes.push({
            filename: file.name,
            status: "error",
            message: responseBody.error ?? t("uploadFailed"),
          });
        } else if (responseBody.status === "empty") {
          outcomes.push({ filename: file.name, status: "empty" });
        } else {
          outcomes.push({
            filename: file.name,
            status: "ok",
            rowsImported: responseBody.rowsImported,
            skipped: responseBody.skipped,
          });
        }
      } catch {
        outcomes.push({
          filename: file.name,
          status: "error",
          message: t("uploadFailed"),
        });
      }
    }
    setResults(outcomes);
    setUploading(false);
  }

  if (!session?.valid || session.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <PerformanceWordmark />
        <div className="flex-1" />
        <Link href="/performance">
          <Button variant="ghost" size="sm">
            {t("backToDashboard")}
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearPerformanceToken();
            router.replace("/performance/login");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {t("uploadTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("uploadIntro")}</p>
            <Input
              type="file"
              multiple
              accept=".xlsx,.xlsm,.csv"
              disabled={uploading}
              onChange={e => void handleFiles(e.target.files)}
            />
            {uploading && (
              <p className="text-sm text-muted-foreground">{t("uploading")}</p>
            )}
            {results.length > 0 && (
              <ul className="space-y-2 text-sm">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-border/70 p-3"
                  >
                    <span className="font-medium">{r.filename}</span>
                    {r.status === "ok" && (
                      <span className="ml-2 text-emerald-600">
                        {t("uploadOk", { count: r.rowsImported ?? 0 })}
                      </span>
                    )}
                    {r.status === "empty" && (
                      <span className="ml-2 text-muted-foreground">
                        {t("uploadEmpty")}
                      </span>
                    )}
                    {r.status === "error" && (
                      <span className="ml-2 text-destructive">{r.message}</span>
                    )}
                    {r.skipped && r.skipped.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("uploadSkipped", { names: r.skipped.join(", ") })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("uploadLogTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!log || log.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("uploadLogEmpty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("uploadLogFile")}</TableHead>
                    <TableHead>{t("uploadLogRows")}</TableHead>
                    <TableHead>{t("uploadLogWhen")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className="max-w-xs truncate">
                        {row.filename}
                      </TableCell>
                      <TableCell>{row.rowsImported}</TableCell>
                      <TableCell>
                        {formatDateTime(row.uploadedAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
