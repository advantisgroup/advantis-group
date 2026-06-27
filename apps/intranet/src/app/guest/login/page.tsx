"use client";

import { useQuery } from "convex/react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setGuestToken } from "@/lib/guest";

function GuestLogin() {
  const t = useTranslations("Guest");
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const probe = useQuery(api.guest.validateToken, token ? { token } : "skip");

  // Auto-enter when arriving via an email link with a valid token.
  useEffect(() => {
    const fromUrl = params.get("token");
    if (fromUrl && probe?.valid && probe.expiresAt) {
      setGuestToken(fromUrl, probe.expiresAt);
      router.replace("/guest");
    }
  }, [params, probe, router]);

  function enter() {
    if (probe?.valid && probe.expiresAt) {
      setGuestToken(token, probe.expiresAt);
      router.replace("/guest");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <BrandLogo className="mb-4" />
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {t("loginTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("loginIntro")}</p>
          <Input
            placeholder={t("codePlaceholder")}
            value={token}
            onChange={e => setToken(e.target.value.trim())}
          />
          {token && probe && !probe.valid && (
            <p className="text-sm text-destructive">{t("invalid")}</p>
          )}
          <Button className="w-full" onClick={enter} disabled={!probe?.valid}>
            {t("enter")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GuestLoginPage() {
  return (
    <Suspense fallback={null}>
      <GuestLogin />
    </Suspense>
  );
}
