"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth, useUser } from "@clerk/nextjs";
import type { SessionWithActivitiesResource } from "@clerk/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { MOTION } from "@/components/activity/motion/motion-tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";

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
  const { user } = useUser();
  const { sessionId } = useAuth();
  const prefersReducedMotion = useReducedMotion();
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
      toast.error(t("sessions.revokeError"));
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
      for (const session of others) await session.revoke();
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
    <Card id="sessions" data-hash-anchor>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold tracking-tight">{t("sessions.title")}</p>
            <p className="text-sm text-muted-foreground">{t("sessions.hint")}</p>
          </div>
          {otherCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-destructive hover:text-destructive sm:w-auto"
              disabled={busyId !== null}
              onClick={() => void revokeOthers()}
            >
              {busyId === "all" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LogOut className="size-3.5" />
              )}
              {t("sessions.revokeAll")}
            </Button>
          )}
        </div>

        {sessions === null ? (
          <div className="flex justify-center py-3 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {sessions.map((session) => {
                const current = session.id === sessionId;
                const Icon = session.latestActivity?.isMobile ? Smartphone : Monitor;
                return (
                  <motion.div
                    key={session.id}
                    layout={!prefersReducedMotion}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: MOTION.base, ease: MOTION.ease }}
                    className="flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-border/70 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-medium">{describe(session)}</p>
                          {current && (
                            <Badge variant="muted" className="text-[10px]">
                              {t("sessions.thisDevice")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("sessions.lastActive", {
                            when: format.relativeTime(new Date(session.lastActiveAt)),
                          })}
                        </p>
                      </div>
                    </div>
                    {!current && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:text-destructive"
                        disabled={busyId !== null}
                        onClick={() => void revoke(session)}
                      >
                        {busyId === session.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <LogOut className="size-3.5" />
                        )}
                        <span className="sr-only">{t("sessions.revokeConfirm")}</span>
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
