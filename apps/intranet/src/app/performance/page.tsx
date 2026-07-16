"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { LineChart, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { BrandLogo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  clearPerformanceToken,
  getPerformanceToken,
} from "@/lib/performanceAuth";

export default function PerformancePage() {
  const t = useTranslations("Performance");
  const router = useRouter();
  const [token] = useState<string | null>(() => getPerformanceToken());

  useEffect(() => {
    if (!token) router.replace("/performance/login");
  }, [router, token]);

  const session = useQuery(
    api.performanceAuth.validateSession,
    token ? { token } : "skip"
  );
  const logout = useMutation(api.performanceAuth.logout);
  const touchSession = useMutation(api.performanceAuth.touchSession);

  useEffect(() => {
    if (token) void touchSession({ token });
  }, [token, touchSession]);

  // Token invalid/expired/deactivated → back to login.
  useEffect(() => {
    if (token && session && !session.valid) {
      clearPerformanceToken();
      router.replace("/performance/login");
    }
  }, [token, session, router]);

  function exit() {
    if (token) void logout({ token });
    clearPerformanceToken();
    router.replace("/performance/login");
  }

  if (!session?.valid) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <BrandLogo />
        <Badge variant="secondary">{t("badge")}</Badge>
        <div className="flex-1" />
        <span className="text-sm text-muted-foreground">{session.name}</span>
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader className="items-center text-center">
            <LineChart className="mb-2 h-8 w-8 text-primary" />
            <CardTitle>{t("comingSoonTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            {session.role === "admin"
              ? t("comingSoonAdmin")
              : t("comingSoonEmployee")}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
