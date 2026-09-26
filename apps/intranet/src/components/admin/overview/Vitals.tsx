"use client";

import type { ReactNode } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import { type LucideIcon, Plug, ShieldCheck, Users, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { useIsAdmin } from "@/components/providers/current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The state of the org in one strip: who's here, who's around, whether the
 * systems are healthy and — for admins — whether everyone meets the sign-in
 * rules. Each cell links to where you'd go to act on it. What's waiting on a
 * decision lives in the queue right below, so it isn't repeated here.
 */
export function Vitals({ tzOffsetMinutes }: { tzOffsetMinutes: number }) {
  const t = useTranslations("Admin");
  const isAdmin = useIsAdmin();
  const pulse = useQuery(api.org.overview.pulse, { tzOffsetMinutes });
  const systems = useQuery(api.org.overview.systems);
  const policy = useQuery(api.security.stepUp.orgPolicy, isAdmin ? {} : "skip");
  const standard = useQuery(api.security.stepUp.orgStandard, isAdmin ? {} : "skip");
  const cells = isAdmin ? 4 : 3;

  if (!pulse || !systems || (isAdmin && (!policy || !standard))) {
    return <Skeleton className="h-[122px] rounded-xl" />;
  }

  const degraded = systems.integrations.filter((i) => i.status === "unavailable").length;
  const incidents = systems.liveUpdates.length;
  const nonCompliant = standard?.nonCompliant.length ?? 0;

  const rules = policy
    ? [
        policy.requireMfaScope !== "off" &&
          t(
            policy.requireMfaScope === "all"
              ? "authenticationBannerMfaAll"
              : "authenticationBannerMfaManagers",
          ),
        policy.requirePasskeyScope !== "off" &&
          t(
            policy.requirePasskeyScope === "all"
              ? "authenticationBannerPasskeyAll"
              : "authenticationBannerPasskeyManagers",
          ),
      ].filter(Boolean)
    : [];

  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-2",
        cells === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      <Cell
        icon={Users}
        label={t("overview.vitals.headcount")}
        value={pulse.headcount.active}
        headline={t("overview.vitals.joined", { count: pulse.joinedWindow })}
        context={t("overview.vitals.headcountContext", {
          managers: pulse.headcount.admins + pulse.headcount.managers,
          external: pulse.headcount.external,
        })}
        href="/admin/members"
      />
      <Cell
        icon={Wifi}
        label={t("overview.vitals.online")}
        value={pulse.onlineNow}
        headline={t("overview.vitals.seenToday", { count: pulse.seenToday })}
        context={t("overview.vitals.onlineContext", { total: pulse.headcount.active })}
        href="/directory"
      />
      <Cell
        icon={Plug}
        label={t("overview.vitals.systems")}
        value={`${systems.integrations.length - degraded}/${systems.integrations.length}`}
        tone={degraded > 0 || incidents > 0 ? "warn" : "ok"}
        headline={
          incidents > 0
            ? t("overview.vitals.incidents", { count: incidents })
            : degraded > 0
              ? t("overview.vitals.systemsDown", { count: degraded })
              : t("overview.vitals.systemsOk")
        }
        context={
          systems.disabledFlags.length > 0
            ? t("overview.vitals.flagsOff", { count: systems.disabledFlags.length })
            : t("overview.vitals.flagsAllOn")
        }
        href="/admin/integrations"
      />
      {isAdmin && (
        <Cell
          icon={ShieldCheck}
          label={t("overview.vitals.security")}
          value={nonCompliant}
          tone={nonCompliant > 0 ? "warn" : "ok"}
          headline={t("overview.vitals.nonCompliant", { count: nonCompliant })}
          context={rules.length > 0 ? rules.join(" · ") : t("authenticationBannerNone")}
          href="/admin/authentication"
        />
      )}
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  headline,
  context,
  href,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  headline: string;
  context: string;
  href: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  return (
    <Link href={href} className="block bg-card px-5 py-4 transition-colors hover:bg-accent/60">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-[1.75rem] font-semibold leading-none tracking-tight",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      <p className="mt-2.5 truncate text-xs font-medium">{headline}</p>
      <p className="truncate text-xs text-muted-foreground">{context}</p>
    </Link>
  );
}
