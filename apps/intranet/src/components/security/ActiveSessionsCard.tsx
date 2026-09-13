"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import type { SessionWithActivitiesResource } from "@clerk/types";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";

/** Clerk's own code for "this session hasn't proven itself recently enough
 * for a sensitive action" — revoking another session is one of those. We
 * don't have a UI here for stepping the user back up, so the only useful
 * move is pointing them at Clerk's own account modal, which does. */
function needsReverification(error: unknown): boolean {
  const errors = (error as { errors?: Array<{ code?: string }> } | null)?.errors;
  return Array.isArray(errors) && errors.some((e) => e.code === "session_reverification_required");
}

/**
 * Where this account is signed in, straight from Clerk.
 *
 * Clerk already owns sessions — it issues them, records the device and
 * location on each, and can revoke them — so this is a wrapper around
 * `user.getSessions()` rather than a second source of truth. The only thing
 * added on top is the intranet's own chrome and the "this device" marker,
 * which Clerk returns the raw material for but doesn't resolve itself.
 */
export function ActiveSessionsCard() {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const confirm = useConfirm();
  const clerk = useClerk();
  const { user } = useUser();
  const { sessionId } = useAuth();

  const [sessions, setSessions] = useState<SessionWithActivitiesResource[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const list = await user.getSessions();
      setSessions(list.filter((session) => session.status === "active"));
    } catch (error) {
      console.error("[sessions] list failed", error);
      toast.error(t("sessions.loadError"));
    }
  }, [user, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function promptReverification() {
    toast.error(t("sessions.needsVerification"), {
      action: {
        label: t("sessions.openSecurity"),
        onClick: () => clerk.openUserProfile(),
      },
    });
  }

  async function revoke(session: SessionWithActivitiesResource) {
    const ok = await confirm({
      title: t("sessions.revokeTitle"),
      description: t("sessions.revokeBody"),
      confirmLabel: t("sessions.revokeConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(session.id);
    try {
      await session.revoke();
      await load();
      toast.success(t("sessions.revoked"));
    } catch (error) {
      console.error("[sessions] revoke failed", error);
      if (needsReverification(error)) {
        promptReverification();
      } else {
        toast.error(t("sessions.revokeError"));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    if (!sessions) return;
    const others = sessions.filter((session) => session.id !== sessionId);
    const ok = await confirm({
      title: t("sessions.revokeAllTitle"),
      description: t("sessions.revokeAllBody", { count: others.length }),
      confirmLabel: t("sessions.revokeAllConfirm"),
      cancelLabel: t("cancel"),
      destructive: true,
    });
    if (!ok) return;
    setBusyId("all");
    try {
      // Sequential rather than Promise.all: Clerk rate-limits these, and a
      // partial failure mid-batch should still leave the ones already
      // revoked revoked.
      for (const session of others) {
        try {
          await session.revoke();
        } catch (error) {
          if (!needsReverification(error)) throw error;
          // Reverification is a property of this session's own proof of
          // identity, not of the target session, so every remaining revoke
          // would fail the same way — stop instead of prompting per-session.
          await load();
          promptReverification();
          return;
        }
      }
      await load();
      toast.success(t("sessions.revokedAll"));
    } catch (error) {
      console.error("[sessions] revoke all failed", error);
      toast.error(t("sessions.revokeError"));
    } finally {
      setBusyId(null);
    }
  }

  function describe(session: SessionWithActivitiesResource): string {
    const activity = session.latestActivity;
    const browser = [activity?.browserName, activity?.browserVersion].filter(Boolean).join(" ");
    const place = [activity?.city, activity?.country].filter(Boolean).join(", ");
    return (
      [browser || activity?.deviceType, place].filter(Boolean).join(" · ") ||
      t("sessions.unknownDevice")
    );
  }

  const otherCount = sessions?.filter((session) => session.id !== sessionId).length ?? 0;

  return (
    <div id="sessions" data-hash-anchor>
      <SettingsSection title={t("sessions.title")} description={t("sessions.hint")}>
        {sessions === null ? (
          <div className="flex justify-center px-4 py-5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          sessions.map((session) => {
            const current = session.id === sessionId;
            const Icon = session.latestActivity?.isMobile ? Smartphone : Monitor;
            return (
              <SettingsRow
                key={session.id}
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{describe(session)}</span>
                    {current && (
                      <span className="shrink-0 text-xs font-normal text-ok">
                        {t("sessions.thisDevice")}
                      </span>
                    )}
                  </span>
                }
                description={t("sessions.lastActive", {
                  when: format.relativeTime(new Date(session.lastActiveAt)),
                })}
                control={
                  !current && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={busyId !== null}
                      aria-label={t("sessions.revokeConfirm")}
                      onClick={() => void revoke(session)}
                    >
                      {busyId === session.id ? <Loader2 className="animate-spin" /> : <LogOut />}
                    </Button>
                  )
                }
              />
            );
          })
        )}
        {otherCount > 0 && (
          <div className="flex justify-end px-4 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busyId !== null}
              onClick={() => void revokeOthers()}
            >
              {busyId === "all" ? <Loader2 className="animate-spin" /> : <LogOut />}
              {t("sessions.revokeAll")}
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
