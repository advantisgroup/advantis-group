"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ProviderBadge } from "@/components/branding/ProviderMark";
import { Button } from "@/components/ui/button";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";

function LinkState({ linked }: { linked: boolean }) {
  const t = useTranslations("Settings");
  return (
    <span
      className={
        linked
          ? "inline-flex items-center gap-1.5 text-xs font-medium"
          : "inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      }
    >
      <span
        className="size-2 rounded-full"
        style={{ background: linked ? "var(--ok)" : "var(--muted-foreground)" }}
      />
      {linked ? t("linked") : t("notLinked")}
    </span>
  );
}

export function ConnectionsCard() {
  const t = useTranslations("Settings");
  const connections = useQuery(api.users.myConnections);
  const migrateLegacyLink = useMutation(api.integrations.clockodoLink.migrateLegacyClockodoLink);
  const [migrating, setMigrating] = useState(false);
  if (!connections) return null;

  const clockodoLinked =
    connections.clockodoDirect || (connections.personLinked && connections.personHasClockodo);
  const clockodoHint = clockodoLinked
    ? connections.clockodoDirect
      ? t("clockodoDirect")
      : t("clockodoViaPerson")
    : t("clockodoUnlinkedHint");
  const canMigrate = !connections.clockodoDirect && connections.personHasClockodo;

  const migrateButton = canMigrate && (
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
  );

  return (
    <div data-tour="tour-settings-connections">
      <SettingsSection title={t("connections")} description={t("connectionsHint")}>
        <SettingsRow
          title={<ProviderBadge provider="clockodo" />}
          description={clockodoHint}
          control={
            <span className="flex items-center gap-3">
              {migrateButton}
              <LinkState linked={clockodoLinked} />
            </span>
          }
        />
        <SettingsRow
          title={t("activityTrack")}
          description={
            connections.personLinked
              ? (connections.personName ?? undefined)
              : t("personUnlinkedHint")
          }
          control={<LinkState linked={connections.personLinked} />}
        />
      </SettingsSection>
    </div>
  );
}
