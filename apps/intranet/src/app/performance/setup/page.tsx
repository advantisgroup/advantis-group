"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useAction } from "convex/react";
import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { BrandLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPerformanceToken } from "@/lib/performanceAuth";

export default function PerformanceSetupPage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const setupAccount = useAction(api.performanceAuth.setupAccount);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email.trim() || !name.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await setupAccount({ email, name, password });
      setPerformanceToken(result.token, result.expiresAt);
      router.replace("/performance");
    } catch {
      setError(t("setupFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <BrandLogo className="mb-4" />
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            {t("setupTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("setupIntro")}</p>
          <div className="space-y-2">
            <Label htmlFor="performance-setup-email">{t("emailLabel")}</Label>
            <Input
              id="performance-setup-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="performance-setup-name">{t("nameLabel")}</Label>
            <Input
              id="performance-setup-name"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="performance-setup-password">
              {t("passwordLabel")}
            </Label>
            <Input
              id="performance-setup-password"
              type="password"
              autoComplete="new-password"
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
            disabled={submitting || !email.trim() || !name.trim() || !password}
            onClick={() => void submit()}
          >
            {t("setupSubmit")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/performance/login"
              className="underline underline-offset-4"
            >
              {t("backToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
