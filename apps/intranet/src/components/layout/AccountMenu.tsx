"use client";

import { useRouter } from "next/navigation";

import { useClerk } from "@clerk/nextjs";
import {
  Building2,
  Eye,
  FileStack,
  FileText,
  LogOut,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Shield,
  Sun,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

import { LocaleFlag } from "@/components/icons/flags";
import { useCurrentUser } from "@/components/providers/current-user";
import { useLocaleSwitch, useMounted } from "@/components/settings/PreferencePickers";
import { useTheme } from "@/components/theme/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales } from "@/i18n/config";
import { initials, roleLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const THEME_MODES = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "system", icon: Monitor },
] as const;

/**
 * Account dropdown. `triggerClassName` lets callers restyle the trigger — the
 * top bar uses the compact default, while the sidebar footer passes a
 * full-width, left-aligned variant so it reads as a row.
 */
export function AccountMenu({
  triggerClassName,
  onNavigate,
  hideName = false,
  showPreferences = false,
}: {
  triggerClassName?: string;
  /** Fired when an item navigates — used to close the mobile sidebar sheet. */
  onNavigate?: () => void;
  /** Icon-only trigger, for the collapsed sidebar rail. */
  hideName?: boolean;
  /** Folds the language/theme picker into this dropdown — used where there's
   *  no room for a separate preferences trigger next to this one (the mobile
   *  sidebar footer). */
  showPreferences?: boolean;
}) {
  const user = useCurrentUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const tNav = useTranslations("Nav");
  const tRoles = useTranslations("Roles");
  const tSettings = useTranslations("Settings");
  const setSandboxRole = useMutation(api.people.users.setSandboxRole);
  const {
    current: currentLocale,
    choose: chooseLocale,
    pending: localePending,
  } = useLocaleSwitch();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  async function enterSandbox(role: "manager" | "employee") {
    await setSandboxRole({ role });
    onNavigate?.();
    router.replace("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn("h-9 gap-2 px-1.5", triggerClassName)}>
          <Avatar className="h-7 w-7 shrink-0">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback className="text-xs">{initials(user.name, user.email)}</AvatarFallback>
          </Avatar>
          {!hideName && <span className="max-w-32 truncate text-sm font-medium">{user.name}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 text-xs font-normal text-primary">{roleLabel(user, tRoles)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showPreferences && (
          <>
            <div className="px-2 py-2">
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tSettings("language")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {locales.map((locale) => (
                  <button
                    key={locale}
                    type="button"
                    disabled={localePending}
                    onClick={() => chooseLocale(locale)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
                      locale === currentLocale
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <LocaleFlag locale={locale} />
                    {locale.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="px-1 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tSettings("appearance")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {THEME_MODES.map(({ key, icon: Icon }) => {
                  const active = mounted && theme === key;
                  const label =
                    key === "light"
                      ? tSettings("themeLight")
                      : key === "dark"
                        ? tSettings("themeDark")
                        : tSettings("themeSystem");
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTheme(key)}
                      aria-label={label}
                      title={label}
                      className={cn(
                        "flex h-10 items-center justify-center rounded-lg border transition-colors",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            router.push("/drafts");
          }}
        >
          <FileStack className="mr-2 h-4 w-4" />
          {tNav("drafts")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            router.push("/settings");
          }}
        >
          <SettingsIcon className="mr-2 h-4 w-4" />
          {tNav("settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            router.push("/privacy");
          }}
        >
          <Shield className="mr-2 h-4 w-4" />
          {tNav("privacy")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            router.push("/terms");
          }}
        >
          <FileText className="mr-2 h-4 w-4" />
          {tNav("terms")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate?.();
            router.push("/imprint");
          }}
        >
          <Building2 className="mr-2 h-4 w-4" />
          {tNav("imprint")}
        </DropdownMenuItem>
        {user.canUseSandbox && (
          <>
            <DropdownMenuSeparator />
            {user.sandboxRole ? (
              <DropdownMenuItem
                onClick={() => {
                  onNavigate?.();
                  void setSandboxRole({ role: null });
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                {tNav("exitSandbox")}
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  {tNav("viewAs")}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void enterSandbox("employee")}>
                  <UserRound className="mr-2 h-4 w-4" />
                  {tNav("viewAsRole", { role: tRoles("employee") })}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void enterSandbox("manager")}>
                  <UsersRound className="mr-2 h-4 w-4" />
                  {tNav("viewAsRole", { role: tRoles("manager") })}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            posthog.reset();
            void signOut({ redirectUrl: "/sign-in" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {tNav("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
