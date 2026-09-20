"use client";

import { useMemo } from "react";

import { SignInButton, SignOutButton, SignUpButton, useClerk, useUser } from "@clerk/nextjs";
import { Building2, Cookie, LogOut, ReceiptText, Settings2, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCompanyIntranetUrl } from "@/hooks/use-company-intranet-url";
import { Link } from "@/i18n/navigation";

const getInitials = (fullName: string, email?: string | null) => {
  const source = fullName.trim() || email?.trim() || "Guest";

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

/**
 * The "you" menu: who you are signed in as, the two things you can do about
 * it, how the site is set up, and the door to the intranet.
 *
 * Everything is one column of equal rows at one padding and one radius. The
 * previous version mixed three radii, put a 4-up grid of flag pills inside a
 * dropdown, and gave the identity block its own inset card — which is why it
 * read as three menus stacked on top of each other rather than one.
 */
export const AccountMenu = ({
  isMobile = false,
  onMobileNavigate,
}: {
  isMobile?: boolean;
  onMobileNavigate?: () => void;
}) => {
  const locale = useLocale();
  const t = useTranslations("auth");
  const tNav = useTranslations("nav");
  const { openUserProfile } = useClerk();
  const { user, isSignedIn } = useUser();
  const intranetUrl = useCompanyIntranetUrl();

  const displayName = useMemo(() => {
    const nameFromParts = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    return user?.fullName || nameFromParts || user?.primaryEmailAddress?.emailAddress || t("guest");
  }, [t, user]);

  const email = user?.primaryEmailAddress?.emailAddress;
  const initials = getInitials(displayName, email);

  const identity = (
    <div className="flex items-center gap-3">
      <Avatar className="size-10">
        {isSignedIn ? <AvatarImage src={user.imageUrl} alt={displayName} /> : null}
        <AvatarFallback className="bg-muted text-sm font-medium text-muted-foreground">
          {isSignedIn ? initials : <UserRound className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {isSignedIn ? displayName : t("menuLabel")}
        </p>
        <p className="truncate text-[13px] text-muted-foreground">
          {isSignedIn ? email : t("providerHint")}
        </p>
      </div>
    </div>
  );

  const signedOutActions = (
    <div className="grid grid-cols-2 gap-2">
      <SignInButton>
        <Button type="button" size="sm" className="w-full" onClick={() => onMobileNavigate?.()}>
          {t("signIn")}
        </Button>
      </SignInButton>
      <SignUpButton>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => onMobileNavigate?.()}
        >
          {t("signUp")}
        </Button>
      </SignUpButton>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-4">
        {identity}
        {isSignedIn ? (
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                onMobileNavigate?.();
                void openUserProfile();
              }}
            >
              <Settings2 />
              {t("accountCta")}
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link
                href="/account/submissions"
                locale={locale}
                onClick={() => onMobileNavigate?.()}
              >
                <ReceiptText />
                {t("submissionsCta")}
              </Link>
            </Button>
            <SignOutButton>
              <Button type="button" variant="ghost" className="w-full justify-start">
                <LogOut />
                {t("signOut")}
              </Button>
            </SignOutButton>
          </div>
        ) : (
          signedOutActions
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={t("menuLabel")}
        >
          <Avatar className="size-8">
            {isSignedIn ? <AvatarImage src={user.imageUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-muted text-[11px] font-medium text-muted-foreground">
              {isSignedIn ? initials : <UserRound className="size-3.5" />}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[19rem]">
        <div className="px-2.5 py-2">{identity}</div>

        <DropdownMenuSeparator />

        {isSignedIn ? (
          <>
            <DropdownMenuItem onSelect={() => void openUserProfile()}>
              <Settings2 />
              {t("accountCta")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account/submissions" locale={locale}>
                <ReceiptText />
                {t("submissionsCta")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : (
          <div className="px-1 py-1">{signedOutActions}</div>
        )}

        <DropdownMenuItem asChild>
          <Link href="/cookies" locale={locale}>
            <Cookie />
            {tNav("cookies")}
          </Link>
        </DropdownMenuItem>

        {intranetUrl ? (
          <DropdownMenuItem asChild>
            <Link href={intranetUrl}>
              <Building2 />
              {tNav("intranet")}
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        {/* Language and appearance: how the site is set up for you, which is
            the same question as who you are signed in as. */}
        <div className="px-2.5 py-2">
          <SettingsMenu />
        </div>

        {isSignedIn ? (
          <>
            <DropdownMenuSeparator />
            <SignOutButton>
              <DropdownMenuItem>
                <LogOut />
                {t("signOut")}
              </DropdownMenuItem>
            </SignOutButton>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
