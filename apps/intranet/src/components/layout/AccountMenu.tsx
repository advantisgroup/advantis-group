"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, Settings as SettingsIcon } from "lucide-react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";

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
import { initials } from "@/lib/format";

export function AccountMenu() {
  const user = useCurrentUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const tNav = useTranslations("Nav");
  const tRoles = useTranslations("Roles");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5">
          <Avatar className="h-7 w-7">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback className="text-xs">
              {initials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
            {user.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
          <span className="mt-1 text-xs font-normal text-primary">
            {tRoles(user.role)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <SettingsIcon className="mr-2 h-4 w-4" />
          {tNav("settings")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void signOut({ redirectUrl: "/sign-in" })}>
          <LogOut className="mr-2 h-4 w-4" />
          {tNav("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
