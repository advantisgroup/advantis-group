"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { PerformanceBrandMark } from "@/components/performance/PerformanceBrandMark";
import { usePerformanceCompanySlug } from "@/components/performance/PerformanceCompanyProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPerformanceToken } from "@/lib/performanceAuth";

export default function PerformanceLoginPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const slug = usePerformanceCompanySlug();
  const login = useAction(api.performanceAuth.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login({ slug, email, password });
      setPerformanceToken(result.token, result.expiresAt);
      router.replace("/performance");
    } catch {
      setError(t("loginInvalid"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <PerformanceBrandMark className="mb-4" />
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            {t("loginTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("loginIntro")}</p>
          <div className="space-y-2">
            <Label htmlFor="performance-email">{t("emailLabel")}</Label>
            <Input
              id="performance-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="performance-password">{t("passwordLabel")}</Label>
            <Input
              id="performance-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            disabled={submitting || !email.trim() || !password}
            onClick={() => void submit()}
          >
            {t("loginSubmit")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/performance/setup"
              className="underline underline-offset-4"
            >
              {t("setupLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
