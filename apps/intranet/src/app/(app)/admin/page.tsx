"use client";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  ChevronRight,
  Clock,
  KeyRound,
  Mail,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { ADMIN_NAV_GROUPS } from "@/components/layout/AdminSidebar";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { Link } from "@/components/Link";
import { PageHeader } from "@/components/PageHeader";
import {
  useHasCapability,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  accent: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
          accent
            ? "bg-signal/12 text-signal ring-signal/25"
            : "bg-panel-2 text-muted-foreground ring-border"
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-none tabular-nums">
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function QuickLinkCard({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-[0_2px_4px_0_rgb(0_0_0/0.05),0_16px_36px_-18px_rgb(0_0_0/0.18)]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
        <Icon />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {label}
      </span>
      {count ? (
        <Badge variant="warning">{count > 99 ? "99+" : count}</Badge>
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      )}
    </Link>
  );
}

export default function AdminPage() {
  const t = useTranslations("Admin");
  const isManager = useIsManager();
  const isAdmin = useIsAdmin();
  const hasUploadsView = useHasCapability("manage_uploads");

  const members = useQuery(api.users.list, { includeSuspended: true });
  const requests = useQuery(
    api.accessRequests.list,
    isManager ? { status: "pending" } : "skip"
  );
  const invites = useQuery(
    api.invites.list,
    isManager ? { status: "pending" } : "skip"
  );
  const guests = useQuery(api.guest.listTempLogins, isAdmin ? {} : "skip");
  const pendingUploads = useQuery(
    api.onedrive.listPending,
    isManager || hasUploadsView ? {} : "skip"
  );

  if (!isManager) {
    return <ForbiddenScreen />;
  }

  const dash = (n: number | undefined) => (n === undefined ? "—" : n);
  const activeMembers = members?.filter(m => m.status === "active").length;
  const reqCount = requests?.length;
  const invCount = invites?.length;
  const guestCount = guests?.filter(g => g.status === "active").length;
  const uploadCount = pendingUploads?.length;

  const stats: {
    label: string;
    value: number | string;
    icon: LucideIcon;
    accent: boolean;
  }[] = [
    {
      label: t("overviewMembers"),
      value: dash(activeMembers),
      icon: Users,
      accent: false,
    },
    {
      label: t("overviewRequests"),
      value: dash(reqCount),
      icon: Clock,
      accent: !!reqCount,
    },
    {
      label: t("overviewInvites"),
      value: dash(invCount),
      icon: Mail,
      accent: !!invCount,
    },
  ];
  if (isAdmin) {
    stats.push({
      label: t("overviewGuests"),
      value: dash(guestCount),
      icon: KeyRound,
      accent: !!guestCount,
    });
  }

  // Badge counts for the quick-access cards below — keyed by href so each
  // card can surface "something's waiting here" without a second query per
  // card (the underlying queries are already fetched for the stat row).
  const counts: Record<string, number | undefined> = {
    "/admin/requests": reqCount,
    "/admin/invites": invCount,
    "/admin/uploads": uploadCount,
    "/admin/guests": guestCount,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={<ShieldCheck />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(s => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Every admin section lives at its own route and shows up in the
          sidebar — this mirrors that same categorization (`ADMIN_NAV_GROUPS`)
          as a set of quick-access cards rather than duplicating each
          section's content here as tabs. */}
      <div className="space-y-6">
        {ADMIN_NAV_GROUPS.filter(
          group => group.labelKey !== "nav.groupGeneral"
        ).map(group => {
          const items = group.items.filter(
            item =>
              (!item.managerOnly || isManager) && (!item.adminOnly || isAdmin)
          );
          if (items.length === 0) return null;
          return (
            <section key={group.labelKey}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(group.labelKey)}
              </h2>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(item => (
                  <QuickLinkCard
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    count={counts[item.href]}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
