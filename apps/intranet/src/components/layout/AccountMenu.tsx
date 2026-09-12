"use client";

import { useRouter } from "next/navigation";

import { useClerk } from "@clerk/nextjs";
import {
  Building2,
  Eye,
  FileStack,
  FileText,
  LogOut,
  Settings as SettingsIcon,
  Shield,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { api } from "@advantis/convex/api";
import { useMutation } from "convex/react";

import { useCurrentUser } from "@/components/providers/current-user";
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
import { initials, roleLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Account dropdown. `triggerClassName` lets callers restyle the trigger — the
 * top bar uses the compact default, while the sidebar footer passes a
 * full-width, left-aligned variant so it reads as a row.
 */
export function AccountMenu({
  triggerClassName,
  onNavigate,
  hideName = false,
}: {
  triggerClassName?: string;
  /** Fired when an item navigates — used to close the mobile sidebar sheet. */
  onNavigate?: () => void;
  /** Icon-only trigger, for the collapsed sidebar rail. */
  hideName?: boolean;
}) {
  const user = useCurrentUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const tNav = useTranslations("Nav");
  const tRoles = useTranslations("Roles");
  const setSandboxRole = useMutation(api.users.setSandboxRole);

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
