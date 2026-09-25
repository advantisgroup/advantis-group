"use client";

import { useEffect, useMemo, useState } from "react";

import { useClerk, useUser } from "@clerk/nextjs";
import { Building2, Cookie, Home, Inbox, LogOut, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

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
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const getInitials = (fullName: string, email?: string | null) => {
  const source = fullName.trim() || email?.trim() || "Guest";

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

const ACCOUNT_LINKS = [
  { href: "/account", key: "yourAccount", icon: Home },
  { href: "/account/submissions", key: "submissionsCta", icon: Inbox },
  { href: "/account/profile", key: "accountCta", icon: UserRound },
] as const;

/**
 * The "you" menu: who you are signed in as, the way into your account, how
 * the site is set up, and the door to the intranet.
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
  const tAccount = useTranslations("account.nav");
  const { signOut } = useClerk();
  const { user, isSignedIn, isLoaded } = useUser();
  const intranetUrl = useCompanyIntranetUrl();
  const pathname = usePathname();
  // read after mount so the header needn't opt into useSearchParams (and Suspense)
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(window.location.search), [pathname]);
  // bring people back to the page they signed in from, query and all
  const returnTo = { redirect_url: `/${locale}${pathname === "/" ? "" : pathname}${search}` };

  const displayName = useMemo(() => {
    const nameFromParts = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    return user?.fullName || nameFromParts || user?.primaryEmailAddress?.emailAddress || t("guest");
  }, [t, user]);

  const email = user?.primaryEmailAddress?.emailAddress;
  const initials = getInitials(displayName, email);
  const current = (href: string) =>
    href === "/account" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const leave = async () => {
    onMobileNavigate?.();
    await signOut({ redirectUrl: `/${locale}` });
    toast(tAccount("signedOut"));
  };

  const avatar = (size: "sm" | "md") => (
    <Avatar className={size === "sm" ? "size-8" : "size-10"}>
      {isSignedIn ? <AvatarImage src={user.imageUrl} alt={displayName} /> : null}
      <AvatarFallback
        className={cn(
          "bg-muted font-medium text-muted-foreground",
          size === "sm" ? "text-[11px]" : "text-sm",
        )}
      >
        {/* nothing until Clerk knows, so a signed-in visitor never sees the guest icon first */}
        {!isLoaded ? null : isSignedIn ? (
          initials
        ) : (
          <UserRound className={size === "sm" ? "size-3.5" : "size-4"} />
        )}
      </AvatarFallback>
    </Avatar>
  );

  const identity = (
    <div className="flex items-center gap-3">
      {avatar("md")}
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
      <Button asChild size="sm" shape="pill" className="w-full">
        <Link
          href={{ pathname: "/sign-in", query: returnTo }}
          locale={locale}
          onClick={() => onMobileNavigate?.()}
        >
          {t("signIn")}
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" shape="pill" className="w-full">
        <Link
          href={{ pathname: "/sign-up", query: returnTo }}
          locale={locale}
          onClick={() => onMobileNavigate?.()}
        >
          {t("signUp")}
        </Link>
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <div className="space-y-4">
        {isSignedIn ? (
          <Link href="/account" onClick={() => onMobileNavigate?.()} className="block">
            {identity}
          </Link>
        ) : (
          identity
        )}
        {isSignedIn ? (
          <div className="grid gap-2">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/account" onClick={() => onMobileNavigate?.()}>
                <Home />
                {t("yourAccount")}
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => void leave()}
            >
              <LogOut />
              {t("signOut")}
            </Button>
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
          {avatar("sm")}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[19rem]">
        {isSignedIn ? (
          <DropdownMenuItem asChild className="px-2.5 py-2">
            <Link href="/account">{identity}</Link>
          </DropdownMenuItem>
        ) : (
          <div className="px-2.5 py-2">{identity}</div>
        )}

        <DropdownMenuSeparator />

        {isSignedIn ? (
          ACCOUNT_LINKS.map(({ href, key, icon: Icon }) => (
            <DropdownMenuItem key={href} asChild>
              <Link href={href} aria-current={current(href) ? "page" : undefined}>
                <Icon />
                {t(key)}
              </Link>
            </DropdownMenuItem>
          ))
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
            <DropdownMenuItem onSelect={() => void leave()}>
              <LogOut />
              {t("signOut")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
