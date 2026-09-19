"use client";

import type { ComponentType } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";
import {
  CircleCheck,
  CircleSlash,
  Laptop,
  Megaphone,
  Plug,
  PowerOff,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Mark } from "@/components/branding/ProviderMark";
import { Link } from "@/components/Link";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/format";

import { MetricRow, Panel, PanelSkeleton } from "./primitives";

/** The webhook row is about Clockodo's feed specifically, so it wears Clockodo. */
function ClockodoMark({ className }: { className?: string }) {
  return <Mark provider="clockodo" className={className} />;
}

const markFor = (provider: "genesys" | "clerk" | "resend" | "onedrive") =>
  function ProviderRowMark({ className }: { className?: string }) {
    return <Mark provider={provider} className={className} />;
  };

const PROVIDER_MARKS: Record<string, ComponentType<{ className?: string }>> = {
  clockodo: ClockodoMark,
  genesys: markFor("genesys"),
  clerk: markFor("clerk"),
  resend: markFor("resend"),
  onedrive: markFor("onedrive"),
};

/**
 * Integration, agent-fleet and killswitch health, plus anything currently
 * declared broken on `/updates`.
 *
 * Status uses the reserved status tokens (`ok`/`warn`) and always ships an icon
 * plus a label — never colour alone, since these sit next to series colours
 * elsewhere on the page and hue by itself would be ambiguous.
 */
export function SystemsPanel() {
  const t = useTranslations("Admin");
  const data = useQuery(api.org.overview.systems);

  return (
    <Panel
      icon={<Plug />}
      title={t("overview.systems.title")}
      description={t("overview.systems.hint")}
      bodyClassName="p-3"
    >
      {data === undefined ? (
        <PanelSkeleton rows={4} />
      ) : (
        <div className="space-y-0.5">
          {data.liveUpdates.length > 0 && (
            <>
              {data.liveUpdates.map((update) => (
                <MetricRow
                  key={update._id}
                  icon={update.type === "incident" ? TriangleAlert : Wrench}
                  label={update.title}
                  sublabel={
                    update.status
                      ? t(`overview.systems.updateStatus.${update.status}`)
                      : t(`overview.systems.updateType.${update.type}`)
                  }
                  trailing={
                    <span className="whitespace-nowrap">{relativeTime(update.startedAt)}</span>
                  }
                  tone={update.type === "incident" ? "critical" : "warn"}
                  href={`/updates/${update._id}`}
                />
              ))}
              <div className="my-2 h-px bg-border/60" />
            </>
          )}

          {data.integrations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              {t("overview.systems.noIntegrations")}
            </p>
          ) : (
            data.integrations.map((integration) => {
              const ok = integration.status === "ok";
              const unconfigured = integration.status === "unconfigured";
              return (
                <MetricRow
                  key={integration.source}
                  // The provider's own mark says which system this is; the
                  // badge on the right already says how it's doing.
                  icon={
                    PROVIDER_MARKS[integration.source] ??
                    (ok ? CircleCheck : unconfigured ? CircleSlash : TriangleAlert)
                  }
                  label={t(`overview.systems.source.${integration.source}`)}
                  sublabel={
                    integration.message ??
                    (integration.lastOkAt
                      ? t("overview.systems.lastOk", { age: relativeTime(integration.lastOkAt) })
                      : null)
                  }
                  tone={ok ? "ok" : unconfigured ? "neutral" : "warn"}
                  trailing={
                    <Badge variant={ok ? "success" : unconfigured ? "muted" : "warning"}>
                      {t(`overview.systems.status.${integration.status}`)}
                    </Badge>
                  }
                  href="/admin/integrations"
                />
              );
            })
          )}

          {data.agents && (
            <MetricRow
              icon={Laptop}
              label={t("overview.systems.agents")}
              sublabel={t("overview.systems.agentsDetail", {
                online: data.agents.online,
                stale: data.agents.stale,
                pending: data.agents.pending,
              })}
              value={data.agents.total}
              tone={data.agents.stale > 0 || data.agents.pending > 0 ? "warn" : "neutral"}
              href="/activity"
            />
          )}

          {data.clockodoWebhook?.lastAt && (
            <MetricRow
              icon={ClockodoMark}
              label={t("overview.systems.webhook")}
              sublabel={t("overview.systems.webhookDetail", {
                age: relativeTime(data.clockodoWebhook.lastAt),
                failures: data.clockodoWebhook.failures,
              })}
              tone={data.clockodoWebhook.failures > 0 ? "warn" : "neutral"}
              href="/admin/integrations/clockodo"
            />
          )}

          {data.disabledFlags.length > 0 && (
            <>
              <div className="my-2 h-px bg-border/60" />
              {data.disabledFlags.map((flag) => (
                <MetricRow
                  key={flag.key}
                  icon={PowerOff}
                  label={t("overview.systems.flagOff", { key: flag.key })}
                  sublabel={flag.reason}
                  trailing={
                    <span className="whitespace-nowrap">{relativeTime(flag.updatedAt)}</span>
                  }
                  tone="warn"
                  href="/admin/feature-flags"
                />
              ))}
            </>
          )}

          {data.liveUpdates.length === 0 && (
            <Link
              href="/updates"
              className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              <Megaphone className="size-3.5" />
              {t("overview.systems.noIncidents")}
            </Link>
          )}
        </div>
      )}
    </Panel>
  );
}
