"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Link2, Loader2, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderBadge } from "@/components/branding/ProviderMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ConnectionsCard() {
  const t = useTranslations("Settings");
  const connections = useQuery(api.users.myConnections);
  const migrateLegacyLink = useMutation(api.integrations.clockodoLink.migrateLegacyClockodoLink);
  const [migrating, setMigrating] = useState(false);
  if (!connections) return null;

  const clockodoLinked =
    connections.clockodoDirect || (connections.personLinked && connections.personHasClockodo);

  return (
    <Card data-tour="tour-settings-connections">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-semibold tracking-tight">{t("connections")}</p>
          <p className="text-sm text-muted-foreground">{t("connectionsHint")}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderBadge provider="clockodo" />
              <span className="hidden text-xs text-muted-foreground sm:block">
                {clockodoLinked
                  ? connections.clockodoDirect
                    ? t("clockodoDirect")
                    : t("clockodoViaPerson")
                  : t("clockodoUnlinkedHint")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!connections.clockodoDirect && connections.personHasClockodo && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={migrating}
                  onClick={() => {
                    setMigrating(true);
                    void migrateLegacyLink({})
                      .then(() => toast.success(t("clockodoMigrationSuccess")))
                      .catch(() => toast.error(t("clockodoMigrationError")))
                      .finally(() => setMigrating(false));
                  }}
                >
                  {migrating && <Loader2 className="size-3.5 animate-spin" />}
                  {t("clockodoMigrate")}
                </Button>
              )}
              <Badge variant={clockodoLinked ? "success" : "muted"} className="gap-1">
                {clockodoLinked ? <Link2 className="size-3" /> : <Unlink className="size-3" />}
                {clockodoLinked ? t("linked") : t("notLinked")}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="text-sm font-medium">{t("activityTrack")}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                {connections.personLinked
                  ? (connections.personName ?? "")
                  : t("personUnlinkedHint")}
              </span>
            </div>
            <Badge
              variant={connections.personLinked ? "success" : "muted"}
              className="shrink-0 gap-1"
            >
              {connections.personLinked ? (
                <Link2 className="size-3" />
              ) : (
                <Unlink className="size-3" />
              )}
              {connections.personLinked ? t("linked") : t("notLinked")}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
