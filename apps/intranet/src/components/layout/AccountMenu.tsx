"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useClerk } from "@clerk/nextjs";
import {
  Eye,
  FileStack,
  LogOut,
  MessageCircle,
  MessageSquareHeart,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

import { PageFeedbackDialog } from "@/components/feedback/PageFeedbackDialog";
import { StatusMessageDialog } from "@/components/profile/StatusMessageDialog";
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
import { activeStatusMessage } from "@/lib/status-message";

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
  const tDesign = useTranslations("Design");
  const tProfile = useTranslations("Profile");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const status = activeStatusMessage(user.statusMessage);
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className={cn("h-9 gap-2 px-1.5", triggerClassName)}>
            <Avatar className="h-7 w-7 shrink-0">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="text-xs">{initials(user.name, user.email)}</AvatarFallback>
            </Avatar>
            {!hideName && (
              <span className="max-w-32 truncate text-sm font-medium">{user.name}</span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex flex-col font-normal">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[13px] font-medium text-foreground">{user.name}</span>
              <span className="shrink-0 text-[11px] text-primary">{roleLabel(user, tRoles)}</span>
            </span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showPreferences && (
            <>
              {/* Language and theme share one row — two small segmented
                  controls instead of two labelled blocks. */}
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <div
                  role="radiogroup"
                  aria-label={tSettings("language")}
                  className="flex rounded-lg border border-border p-0.5"
                >
                  {locales.map((locale) => (
                    <button
                      key={locale}
                      type="button"
                      role="radio"
                      aria-checked={locale === currentLocale}
                      disabled={localePending}
                      onClick={() => chooseLocale(locale)}
                      className={cn(
                        "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-60",
                        locale === currentLocale
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <LocaleFlag locale={locale} />
                      {locale.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div
                  role="radiogroup"
                  aria-label={tSettings("appearance")}
                  className="flex rounded-lg border border-border p-0.5"
                >
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
                        role="radio"
                        aria-checked={active}
                        onClick={() => setTheme(key)}
                        aria-label={label}
                        title={label}
                        className={cn(
                          "grid size-8 place-items-center rounded-md transition-colors",
                          active
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          {/* No onNavigate, like page feedback below: the dialog lives in this menu. */}
          <DropdownMenuItem onClick={() => setStatusOpen(true)}>
            <MessageCircle className="mr-2 h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">
              {status ? status.text : tProfile("statusSet")}
            </span>
          </DropdownMenuItem>
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
          {/* No onNavigate: it closes the mobile sidebar sheet, which would take
            this menu — and the dialog it owns — down with it. */}
          <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
            <MessageSquareHeart className="mr-2 h-4 w-4" />
            {tDesign("menuItem")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.canUseSandbox &&
            (user.sandboxRole ? (
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
              // One row with two small choices rather than a label and two rows.
              <div className="flex items-center gap-1 py-0.5 pl-2 pr-1">
                <Eye className="mr-1 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{tNav("viewAs")}</span>
                {(["employee", "manager"] as const).map((role) => (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => void enterSandbox(role)}
                    className="h-7 rounded-md border border-border px-2 text-xs"
                  >
                    {tRoles(role)}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          <DropdownMenuItem
            onClick={() => {
              posthog.reset();
              void signOut({ redirectUrl: "/sign-in" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {tNav("signOut")}
          </DropdownMenuItem>
          {/* Legal pages are rarely needed but must stay reachable — a line
              of small links rather than three full rows. */}
          <DropdownMenuSeparator />
          <div className="flex flex-wrap gap-x-0.5 px-0.5 pb-0.5">
            {(
              [
                ["privacy", "/privacy"],
                ["terms", "/terms"],
                ["imprint", "/imprint"],
              ] as const
            ).map(([key, href]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => {
                  onNavigate?.();
                  router.push(href);
                }}
                className="px-1.5 py-1 text-[11.5px] text-muted-foreground"
              >
                {tNav(key)}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <PageFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <StatusMessageDialog open={statusOpen} onOpenChange={setStatusOpen} />
    </>
  );
}
