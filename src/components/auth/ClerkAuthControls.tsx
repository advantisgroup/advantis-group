"use client";

import { useMemo } from "react";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { LogIn, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export const ClerkAuthControls = ({
  isMobile = false,
}: {
  isMobile?: boolean;
}) => {
  const locale = useLocale();
  const t = useTranslations("auth");
  const { user } = useUser();

  const displayName = useMemo(() => {
    const nameFromParts = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

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
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">
            {t("menuLabel")}
          </span>

          <Show when="signed-in">
            <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{t("signedIn")}</p>
                </div>
                <UserButton />
              </div>
              <Button asChild className="w-full">
                <Link href="/account" locale={locale}>
                  {t("accountCta")}
                </Link>
              </Button>
            </div>
          </Show>

          <Show when="signed-out">
            <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3">
              <p className="text-sm text-muted-foreground">{t("providerHint")}</p>
              <div className="flex flex-col gap-2">
                <SignInButton>
                  <Button className="w-full">
                    <LogIn className="mr-2 h-4 w-4" />
                    {t("signIn")}
                  </Button>
                </SignInButton>
                <SignUpButton>
                  <Button variant="outline" className="w-full">
                    <UserRound className="mr-2 h-4 w-4" />
                    {t("signUp")}
                  </Button>
                </SignUpButton>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Link href="/sign-in" locale={locale}>{t("signInPageCta")}</Link>
                <span>•</span>
                <Link href="/sign-up" locale={locale}>{t("signUpPageCta")}</Link>
              </div>
            </div>
          </Show>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="block px-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
        {t("menuLabel")}
      </span>

      <Show when="signed-in">
        <div className="rounded-xl border border-border bg-card/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{t("signedIn")}</p>
            </div>
            <UserButton />
          </div>
          <Button asChild size="sm" className="w-full">
            <Link href="/account" locale={locale}>
              {t("accountCta")}
            </Link>
          </Button>
        </div>
      </Show>

      <Show when="signed-out">
        <div className="space-y-3 px-2">
          <p className="text-xs leading-5 text-muted-foreground">{t("providerHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <SignInButton>
              <Button size="sm" className="w-full">
                {t("signIn")}
              </Button>
            </SignInButton>
            <SignUpButton>
              <Button size="sm" variant="outline" className="w-full">
                {t("signUp")}
              </Button>
            </SignUpButton>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Link href="/sign-in" locale={locale}>{t("signInPageCta")}</Link>
            <span>•</span>
            <Link href="/sign-up" locale={locale}>{t("signUpPageCta")}</Link>
          </div>
        </div>
      </Show>
    </div>
  );
};
