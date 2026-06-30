"use client";

import Link from "next/link";

import { Users2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/activity/i18n";

/**
 * Users & roles for the activity area. Roles, invitations and access requests
 * are owned by the intranet-wide admin area (advantis roles:
 * admin / manager / employee), so rather than duplicating that surface here we
 * point administrators to it. This keeps a single source of truth for who can
 * do what.
 */
export function UsersPanel() {
  const { t } = useI18n();
  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
            <Users2 className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">
            {t("settings.users.heading")}
          </CardTitle>
        </div>
        <CardDescription>{t("settings.users.body")}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        <Button asChild>
          <Link href="/admin">
            <Users2 className="h-4 w-4" />
            {t("settings.users.cta")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
