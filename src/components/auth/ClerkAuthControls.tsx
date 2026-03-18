"use client";

import { useMemo } from "react";

import { LogIn, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ClerkMount } from "@/components/auth/ClerkMount";
import { useClerkAuth } from "@/components/auth/ClerkAuthProvider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export const ClerkAuthControls = ({
  isMobile = false,
}: {
  isMobile?: boolean;
}) => {
  const locale = useLocale();
  const t = useTranslations("auth");
  const { isEnabled, isLoaded, isSignedIn, user } = useClerkAuth();

  const displayName = useMemo(() => {
    const nameFromParts = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(" ");

    return (
      user?.fullName ||
      nameFromParts ||
      user?.primaryEmailAddress?.emailAddress ||
      t("guest")
    );
  }, [t, user]);

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider block">
            {t("menuLabel")}
          </span>
          {!isEnabled ? (
            <p className="text-sm text-muted-foreground">{t("missingConfig")}</p>
          ) : !isLoaded ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : isSignedIn ? (
            <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{t("signedIn")}</p>
                </div>
                <ClerkMount variant="userButton" />
              </div>
              <Button asChild className="w-full">
                <Link href="/account" locale={locale}>
                  {t("accountCta")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/sign-in" locale={locale}>
                  <LogIn className="mr-2 h-4 w-4" />
                  {t("signIn")}
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/sign-up" locale={locale}>
                  <UserRound className="mr-2 h-4 w-4" />
                  {t("signUp")}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="block px-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
        {t("menuLabel")}
      </span>
      {!isEnabled ? (
        <p className="px-2 text-sm text-muted-foreground">{t("missingConfig")}</p>
      ) : !isLoaded ? (
        <p className="px-2 text-sm text-muted-foreground">{t("loading")}</p>
      ) : isSignedIn ? (
        <div className="rounded-xl border border-border bg-card/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{t("signedIn")}</p>
            </div>
            <ClerkMount variant="userButton" className="shrink-0" />
          </div>
          <Button asChild size="sm" className="w-full">
            <Link href="/account" locale={locale}>
              {t("accountCta")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-2">
          <Button asChild size="sm" className="w-full">
            <Link href="/sign-in" locale={locale}>
              {t("signIn")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link href="/sign-up" locale={locale}>
              {t("signUp")}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
};
