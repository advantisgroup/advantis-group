"use client";

import { useCallback, useEffect, useState } from "react";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { type TeamAccessRow, useOneDriveApi } from "@/lib/onedrive-api";

/**
 * Direct, per-employee OneDrive sharing on the Team folder (Graph `/invite`) —
 * distinct from the intranet's own read/upload-request access control
 * (`classifyAccess` in apps/api), which every active user already gets
 * regardless of this. This grants native OneDrive access (File Explorer,
 * mobile, Outlook) using the employee's own identity.
 */
export function TeamAccessPanel() {
  const t = useTranslations("Admin");
  const api = useOneDriveApi();
  const handleError = useErrorHandler();

  const [rows, setRows] = useState<TeamAccessRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { users } = await api.teamAccessRoster();
      setRows(users);
      setLoadError(false);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onGrant(row: TeamAccessRow) {
    setBusyId(row.userId);
    try {
      const res = await api.grantTeamAccess(row.userId, row.email);
      toast.success(
        res.alreadyHadAccess
          ? t("teamAccessAlreadyHadAccess", {
              roles: res.roles?.join(", ") || "—",
            })
          : t("teamAccessGranted"),
      );
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function onRevoke(row: TeamAccessRow) {
    if (!row.permissionId) return;
    setBusyId(row.userId);
    try {
      await api.revokeTeamAccess(row.userId, row.permissionId);
      toast.success(t("teamAccessRevoked"));
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function onSyncAll() {
    setSyncing(true);
    try {
      const { granted, alreadyHadAccess, skipped } = await api.syncTeamAccess();
      toast.success(
        t("teamAccessSynced", {
          granted,
          alreadyHadAccess,
          skipped,
        }),
      );
      await load();
    } catch (err) {
      handleError(err);
    } finally {
      setSyncing(false);
    }
  }

  if (loadError) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{t("teamAccessLoadError")}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("teamAccessDescription")}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onSyncAll()}
          disabled={syncing || rows === null}
          className="w-full sm:w-auto sm:shrink-0"
        >
          {t("teamAccessSyncAll")}
        </Button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
          {rows.map((row) => (
            <div
              key={row.userId}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={row.permissionId ? "success" : "muted"}>
                  {row.permissionId ? t("teamAccessHasAccess") : t("teamAccessNoAccess")}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.userId}
                  onClick={() => void (row.permissionId ? onRevoke(row) : onGrant(row))}
                >
                  {row.permissionId ? t("teamAccessRevoke") : t("teamAccessGrant")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
