"use client";

import { useMemo } from "react";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { LogIn, ReceiptText, UserRound } from "lucide-react";
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
  const isSignedIn = Boolean(user);

  const displayName = useMemo(() => {
    const nameFromParts = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    return (
      user?.fullName ||
      nameFromParts ||
      user?.primaryEmailAddress?.emailAddress ||
      t("guest")
    );
  }, [t, user]);

  const accountEmail = user?.primaryEmailAddress?.emailAddress;

  if (isMobile) {
    return isSignedIn ? (
      <div className="rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
            {accountEmail ? (
              <p className="truncate text-sm text-muted-foreground">{accountEmail}</p>
            ) : null}
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-advantis">
              {t("signedIn")}
            </p>
          </div>
          <UserButton />
        </div>
        <div className="mt-4 grid gap-2">
          <Button asChild className="w-full">
            <Link href="/account" locale={locale}>
              {t("accountCta")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/account/submissions" locale={locale}>
              <ReceiptText className="mr-2 h-4 w-4" />
              {t("submissionsCta")}
            </Link>
          </Button>
        </div>
      </div>
    ) : (
      <div className="rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
        <p className="text-sm leading-6 text-muted-foreground">{t("providerHint")}</p>
        <div className="mt-4 flex flex-col gap-2">
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
      </div>
    );
  }

  return isSignedIn ? (
    <div className="rounded-[1.75rem] border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
          {accountEmail ? (
            <p className="truncate text-sm text-muted-foreground">{accountEmail}</p>
          ) : null}
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-advantis">
            {t("signedIn")}
          </p>
        </div>
        <div className="shrink-0">
          <UserButton />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button asChild size="sm" className="w-full">
          <Link href="/account" locale={locale}>
            {t("accountCta")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href="/account/submissions" locale={locale}>
            <ReceiptText className="mr-2 h-4 w-4" />
            {t("submissionsCta")}
          </Link>
        </Button>
      </div>
    </div>
  ) : (
    <div className="rounded-[1.75rem] border border-border bg-card/80 p-4 shadow-sm">
      <p className="text-sm leading-6 text-muted-foreground">{t("providerHint")}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
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
    </div>
  );
};
