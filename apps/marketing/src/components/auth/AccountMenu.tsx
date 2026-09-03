"use client";

import { useMemo } from "react";

import { SignInButton, SignOutButton, SignUpButton, useClerk, useUser } from "@clerk/nextjs";
import { ChevronRight, LogIn, LogOut, ReceiptText, Settings2, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";

const getInitials = (fullName: string, email?: string | null) => {
  const source = fullName.trim() || email?.trim() || "Guest";
  const parts = source.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

export const AccountMenu = ({
  isMobile = false,
  onMobileNavigate,
}: {
  isMobile?: boolean;
  onMobileNavigate?: () => void;
}) => {
  const locale = useLocale();
  const t = useTranslations("auth");
  const { openUserProfile } = useClerk();
  const { user, isSignedIn } = useUser();

  const displayName = useMemo(() => {
    const nameFromParts = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    return user?.fullName || nameFromParts || user?.primaryEmailAddress?.emailAddress || t("guest");
  }, [t, user]);

  const email = user?.primaryEmailAddress?.emailAddress;
  const initials = getInitials(displayName, email);

  if (isMobile) {
    return isSignedIn ? (
      <div className="space-y-4 border border-rule bg-background/70 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 border-advantis/20 bg-advantis/10">
            <AvatarImage src={user.imageUrl} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            {email ? <p className="truncate text-sm text-muted-foreground">{email}</p> : null}
          </div>
        </div>

        <div className="grid gap-2">
          <Button
            type="button"
            className="w-full justify-between"
            onClick={() => {
              onMobileNavigate?.();
              void openUserProfile();
            }}
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              {t("accountCta")}
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button asChild variant="outline" className="w-full justify-between">
            <Link href="/account/submissions" locale={locale} onClick={() => onMobileNavigate?.()}>
              <span className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4" />
                {t("submissionsCta")}
              </span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <SignOutButton>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </Button>
          </SignOutButton>
        </div>
      </div>
    ) : (
      <div className="space-y-4 border border-rule bg-background/70 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11">
            <AvatarFallback>
              <UserRound className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{t("menuLabel")}</p>
            <p className="text-sm text-muted-foreground">{t("providerHint")}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SignInButton>
            <Button type="button" className="w-full" onClick={() => onMobileNavigate?.()}>
              <LogIn className="h-4 w-4" />
              {t("signIn")}
            </Button>
          </SignInButton>
          <SignUpButton>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onMobileNavigate?.()}
            >
              <UserRound className="h-4 w-4" />
              {t("signUp")}
            </Button>
          </SignUpButton>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group/account relative inline-flex h-8 w-8 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("menuLabel")}
        >
          <span className="absolute inset-0 rounded-full bg-advantis/10 opacity-0 blur-md transition-opacity duration-300 group-hover/account:opacity-100" />
          <Avatar className="relative z-10 h-8 w-8 border-border/80 bg-background transition-colors duration-200 group-hover/account:border-advantis/40">
            {isSignedIn ? <AvatarImage src={user.imageUrl} alt={displayName} /> : null}
            <AvatarFallback
              className={
                isSignedIn
                  ? "bg-advantis/10 text-xs text-advantis"
                  : "bg-muted text-muted-foreground"
              }
            >
              {isSignedIn ? initials : <UserRound className="h-3.5 w-3.5" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 rounded-2xl border border-border/80 bg-popover p-2 shadow-md"
      >
        {isSignedIn ? (
          <>
            <div className="flex items-center gap-3 rounded-xl px-3 py-3">
              <Avatar className="h-11 w-11 border-advantis/20 bg-advantis/10">
                <AvatarImage src={user.imageUrl} alt={displayName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                {email ? <p className="truncate text-sm text-muted-foreground">{email}</p> : null}
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="cursor-pointer rounded-xl px-3 py-3"
              onSelect={() => void openUserProfile()}
            >
              <Settings2 className="h-4 w-4" />
              <span>{t("accountCta")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="rounded-xl px-3 py-3">
              <Link href="/account/submissions" locale={locale}>
                <ReceiptText className="h-4 w-4" />
                <span>{t("submissionsCta")}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <SignOutButton>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span>{t("signOut")}</span>
              </button>
            </SignOutButton>
          </>
        ) : (
          <div className="space-y-4 p-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t("menuLabel")}</p>
              <p className="text-sm leading-6 text-muted-foreground">{t("providerHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SignInButton>
                <Button type="button" size="sm" className="w-full">
                  {t("signIn")}
                </Button>
              </SignInButton>
              <SignUpButton>
                <Button type="button" size="sm" variant="outline" className="w-full">
                  {t("signUp")}
                </Button>
              </SignUpButton>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
