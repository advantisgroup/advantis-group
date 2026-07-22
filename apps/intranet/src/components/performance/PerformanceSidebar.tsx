"use client";

import { usePathname } from "next/navigation";

import { LogOut, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/layout/SettingsMenu";
import { Link } from "@/components/Link";
import { PerformanceAccountMenu } from "@/components/performance/PerformanceAccountMenu";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface PerformanceSidebarNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Performance's own sidebar content — mirrors `ActivitySidebar`'s
 * config-driven shape (same `@/components/ui/sidebar` primitives), since
 * Performance runs its own `SidebarProvider` outside the main `AppShell`
 * (see `PerformanceShell.tsx` for why: it must stay reachable by
 * password-only "mitarbeiter" logins that have no Clerk session at all,
 * so it can't nest under `(app)/layout.tsx`'s Clerk-gated `AppGate`).
 *
 * `navItems` are the page-specific links each caller already computes
 * (Benutzer, Upload, Passwort, back-to-dashboard — same set/visibility
 * rules `PerformanceHeader` used to take). The logout button lives in the
 * footer, bottom-left, next to the account/settings menus — visible and
 * unambiguous rather than buried in a dropdown.
 */
export function PerformanceSidebar({
  navItems,
  onExit,
}: {
  navItems: PerformanceSidebarNavItem[];
  onExit?: () => void;
}) {
  const t = useTranslations("Performance");
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

  return (
    <>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map(item => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    active={active}
                    tooltip={item.label}
                  >
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                    >
                      {Icon && <Icon />}
                      <SidebarLabel>{item.label}</SidebarLabel>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <div className="flex items-center gap-1 border-b border-sidebar-border pb-2">
          <PerformanceAccountMenu />
          <SettingsMenu className="shrink-0" />
        </div>
        {onExit && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onExit} tooltip={t("exit")}>
                <LogOut />
                <SidebarLabel>{t("exit")}</SidebarLabel>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </>
  );
}
