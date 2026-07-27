"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, LogOut, Megaphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { BrandLogo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichText } from "@/components/ui/rich-text";
import { formatDateTime } from "@/lib/format";
import { clearGuestToken, getGuestToken } from "@/lib/guest";

export default function GuestTourPage() {
  const t = useTranslations("Guest");
  const locale = useLocale();
  const router = useRouter();
  const [token] = useState<string | null>(() => getGuestToken());

  useEffect(() => {
    if (!token) router.replace("/guest/login");
  }, [router, token]);

  const content = useQuery(api.guest.getTourContent, token ? { token } : "skip");
  const touch = useMutation(api.guest.touch);

  useEffect(() => {
    if (token) void touch({ token });
  }, [token, touch]);

  // Token invalid/expired/revoked → back to login.
  useEffect(() => {
    if (token && content === null) {
      clearGuestToken();
      router.replace("/guest/login");
    }
  }, [token, content, router]);

  function exit() {
    clearGuestToken();
    router.replace("/guest/login");
  }

  if (!content) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
        <BrandLogo />
        <Badge variant="secondary">{t("badge")}</Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={exit}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("exit")}
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("welcome", { label: content.label })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="h-5 w-5 text-primary" />
            {t("announcements")}
          </h2>
          {content.announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            content.announcements.map((a) => (
              <Card nested key={a._id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(a.publishedAt, locale)}
                  </p>
                </CardHeader>
                <CardContent>
                  <RichText html={a.body} />
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            {t("events")}
          </h2>
          {content.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            content.events.map((e) => (
              <Card nested key={e._id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{e.title}</p>
                    {e.location && <p className="text-xs text-muted-foreground">{e.location}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(e.start, locale)}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
