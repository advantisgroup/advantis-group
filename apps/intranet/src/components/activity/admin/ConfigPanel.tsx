"use client";

import { useEffect, useState, type FormEvent } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldAlert,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";

import { Reveal } from "@/components/activity/motion/Reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/activity/i18n";
import { useActionWithToast } from "@/lib/activity/useActionWithToast";
import { useMutationWithToast } from "@/lib/activity/useMutationWithToast";
import { useToast } from "@/lib/activity/useToast";

/** A single labelled numeric config field with a unit suffix. */
function NumberField({
  label,
  hint,
  value,
  unit,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | "";
  unit: string;
  onChange: (v: number | "") => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-fg">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={e =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          className="w-32"
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Operational configuration + tracker debug password (IT admin). */
export function ConfigPanel({
  onOpenDiscarded,
}: {
  /** Opens the tucked-away "Discarded data" audit view (settings tab). */
  onOpenDiscarded?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  // ── Operational config ────────────────────────────────────────────────
  const config = useQuery(api.activity.settings.getConfig);
  const setConfig = useMutationWithToast(api.activity.settings.setConfig);

  const [inactivity, setInactivity] = useState<number | "">("");
  const [offline, setOffline] = useState<number | "">("");
  const [retention, setRetention] = useState<number | "">("");
  const [savingCfg, setSavingCfg] = useState(false);

  useEffect(() => {
    if (!config) return;
    // Seed the form fields once the config query resolves. Intentional
    // server-data → local-form sync.
    /* eslint-disable react-hooks/set-state-in-effect */
    setInactivity(config.inactivityThresholdSeconds);
    setOffline(config.offlineThresholdSeconds);
    setRetention(config.retentionDays);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [config]);

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    if (inactivity === "" || offline === "" || retention === "") {
      toast(t("settings.config.invalid"), "warn");
      return;
    }
    setSavingCfg(true);
    await setConfig(
      {
        inactivityThresholdSeconds: inactivity,
        offlineThresholdSeconds: offline,
        retentionDays: retention,
      },
      { success: t("settings.config.saved") }
    );
    setSavingCfg(false);
  }

  // ── Access control (read-only) ────────────────────────────────────────
  // The intranet governs sign-in centrally (env-configured domains + the
  // access-requests flow), so this card reflects that configuration but does
  // not let it be edited here — editing would not change real gating.
  const access = useQuery(api.activity.access.getAccessControl);

  // ── Tracker debug password ────────────────────────────────────────────
  const isSet = useQuery(api.activity.settings.debugPasswordIsSet);
  const setDebugPassword = useActionWithToast(
    api.activity.settings.setDebugPassword
  );
  const [pw, setPw] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(id);
  }, [saved]);

  // ── Troubleshooting (one-click repairs) ───────────────────────────────
  // Batched server mutations driven from the browser in a loop, so repairs
  // that used to need the Convex CLI work from any device (incl. phones).
  type TroubleKey = "sync" | "quarantine" | "prune" | "sanitize";
  const [troubleBusy, setTroubleBusy] = useState<TroubleKey | null>(null);
  const [troubleResult, setTroubleResult] = useState<
    Partial<Record<TroubleKey, string>>
  >({});
  const MAX_TROUBLE_BATCHES = 500;
  const todayIso = new Date().toISOString().slice(0, 10);
  const [sanitizeDay, setSanitizeDay] = useState(todayIso);

  const syncNow = useActionWithToast(
    api.activity.integrations.troubleshootSyncNow
  );
  const quarantineStep = useMutation(
    api.activity.maintenance.troubleshootQuarantineOutOfHours
  );
  const pruneStep = useMutation(api.activity.maintenance.troubleshootPruneNow);
  const sanitizeDayAction = useActionWithToast(
    api.activity.clockodo.troubleshootSanitizeDay
  );

  async function runSyncNow() {
    setTroubleBusy("sync");
    const res = await syncNow({}, { success: t("settings.trouble.syncDone") });
    if (res !== undefined) {
      setTroubleResult(r => ({ ...r, sync: t("settings.trouble.syncDone") }));
    }
    setTroubleBusy(null);
  }

  async function runQuarantine() {
    setTroubleBusy("quarantine");
    try {
      let cursor: number | undefined = undefined;
      let moved = 0;
      for (let i = 0; i < MAX_TROUBLE_BATCHES; i++) {
        const res = await quarantineStep({ cursor }) as {
          scanned: number;
          quarantined: number;
          cursorAt: number | null;
          done: boolean;
        };
        moved += res.quarantined;
        if (res.done || res.cursorAt == null) break;
        cursor = res.cursorAt;
      }
      const msg = t("settings.trouble.quarantineDone", { count: moved });
      setTroubleResult(r => ({ ...r, quarantine: msg }));
      toast(msg, "ok");
    } catch (err) {
      console.error("[troubleshoot quarantine failed]", err);
      toast(t("settings.trouble.failed"), "danger");
    }
    setTroubleBusy(null);
  }

  async function runPrune() {
    setTroubleBusy("prune");
    try {
      let deleted = 0;
      for (let i = 0; i < MAX_TROUBLE_BATCHES; i++) {
        const res = await pruneStep({ continuation: i > 0 || undefined });
        deleted += res.deleted;
        if (res.done) break;
      }
      const msg = t("settings.trouble.pruneDone", { count: deleted });
      setTroubleResult(r => ({ ...r, prune: msg }));
      toast(msg, "ok");
    } catch (err) {
      console.error("[troubleshoot prune failed]", err);
      toast(t("settings.trouble.failed"), "danger");
    }
    setTroubleBusy(null);
  }

  async function runSanitizeDay() {
    setTroubleBusy("sanitize");
    const res = await sanitizeDayAction({ day: sanitizeDay });
    if (res !== undefined) {
      const msg = t("settings.trouble.sanitizeDone", {
        people: res.peopleProcessed,
        inserted: res.inserted,
        deleted: res.deleted,
        quarantined: res.quarantined,
      });
      setTroubleResult(r => ({ ...r, sanitize: msg }));
      toast(msg, "ok");
    }
    setTroubleBusy(null);
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (pw.length < 6) {
      toast(t("settings.debugPw.tooShort"), "warn");
      return;
    }
    setBusy(true);
    const result = await setDebugPassword(
      { password: pw },
      { success: t("settings.debugPw.saved") }
    );
    setBusy(false);
    if (result !== undefined) {
      setPw("");
      setSaved(true);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Operational thresholds */}
      <Card className="animate-fade-up">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">
              {t("settings.config.heading")}
            </CardTitle>
          </div>
          <CardDescription>{t("settings.config.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-0">
          {config === undefined ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <form onSubmit={saveConfig} className="space-y-5">
              <NumberField
                label={t("settings.config.inactivity")}
                hint={t("settings.config.inactivityHint")}
                value={inactivity}
                unit={t("settings.config.seconds")}
                onChange={setInactivity}
              />
              <NumberField
                label={t("settings.config.offline")}
                hint={t("settings.config.offlineHint")}
                value={offline}
                unit={t("settings.config.seconds")}
                onChange={setOffline}
              />
              <NumberField
                label={t("settings.config.retention")}
                hint={t("settings.config.retentionHint")}
                value={retention}
                unit={t("settings.config.days")}
                onChange={setRetention}
              />
              <Button type="submit" disabled={savingCfg}>
                {savingCfg && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("settings.config.save")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Tracker debug password */}
      <Card className="animate-fade-up">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
              <KeyRound className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">
              {t("settings.debugPw.heading")}
            </CardTitle>
          </div>
          <CardDescription>{t("settings.debugPw.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 sm:pt-0">
          <div>
            {isSet === undefined ? (
              <Skeleton className="h-5 w-32" />
            ) : isSet ? (
              <Badge variant="success">{t("settings.debugPw.set")}</Badge>
            ) : (
              <Badge variant="muted">{t("settings.debugPw.unset")}</Badge>
            )}
          </div>

          <form onSubmit={savePassword} className="flex gap-2">
            <Input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder={t("settings.debugPw.new")}
              className="flex-1"
            />
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("settings.debugPw.save")}
            </Button>
          </form>

          <Reveal show={saved}>
            <p className="flex items-center gap-1.5 text-sm text-ok">
              <CheckCircle2 className="h-4 w-4" />
              {t("settings.debugPw.saved")}
            </p>
          </Reveal>
        </CardContent>
      </Card>

      {/* Troubleshooting — one-click repairs runnable from any device (incl.
          phones), so fixing stuck/stale data never requires the Convex CLI. */}
      <Card className="animate-fade-up lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
              <Wrench className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">
              {t("settings.trouble.heading")}
            </CardTitle>
          </div>
          <CardDescription>{t("settings.trouble.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-0 sm:pt-0">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Button
                variant="outline"
                disabled={troubleBusy !== null}
                onClick={runSyncNow}
                className="w-full sm:w-auto"
              >
                {troubleBusy === "sync" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("settings.trouble.syncNow")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("settings.trouble.syncNowHint")}
              </p>
              {troubleResult.sync && (
                <p className="text-xs font-medium text-ok">
                  {troubleResult.sync}
                </p>
              )}
            </div>

            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Button
                variant="outline"
                disabled={troubleBusy !== null}
                onClick={runQuarantine}
                className="w-full sm:w-auto"
              >
                {troubleBusy === "quarantine" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("settings.trouble.quarantine")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("settings.trouble.quarantineHint")}
              </p>
              {troubleResult.quarantine && (
                <p className="text-xs font-medium text-ok">
                  {troubleResult.quarantine}
                </p>
              )}
            </div>

            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Button
                variant="outline"
                disabled={troubleBusy !== null}
                onClick={runPrune}
                className="w-full sm:w-auto"
              >
                {troubleBusy === "prune" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("settings.trouble.prune")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("settings.trouble.pruneHint")}
              </p>
              {troubleResult.prune && (
                <p className="text-xs font-medium text-ok">
                  {troubleResult.prune}
                </p>
              )}
            </div>
          </div>

          {/* Deep sanitize — a deep per-day Clockodo entries fetch, not just
              the live "now" poll, so it can also correct already-recorded
              history (e.g. an entry edited/deleted in Clockodo after the
              fact, or anything still wrong from before the business-hours
              fix). Only touches Clockodo-owned states (ABSENT/CLOCKED_OUT/
              BREAK); it never overwrites IN_CALL/WRAP_UP/ACTIVE/IDLE evidence
              from Genesys or the desktop agent. */}
          <div className="border-t border-border-soft pt-4">
            <p className="text-sm font-medium text-fg">
              {t("settings.trouble.sanitize")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.trouble.sanitizeHint")}
            </p>
            <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t("timeline.day.date")}
                <Input
                  type="date"
                  value={sanitizeDay}
                  max={todayIso}
                  onChange={e => setSanitizeDay(e.target.value || todayIso)}
                  className="w-40"
                />
              </label>
              <Button
                variant="outline"
                disabled={troubleBusy !== null}
                onClick={runSanitizeDay}
              >
                {troubleBusy === "sanitize" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("settings.trouble.sanitizeRun")}
              </Button>
            </div>
            {troubleResult.sanitize && (
              <p className="mt-2 text-xs font-medium text-ok">
                {troubleResult.sanitize}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Discarded data — entry point to the quarantine audit view. Kept as a
          button here instead of a prominent tab: rejected signals are for
          occasional review, not daily browsing. */}
      {onOpenDiscarded && (
        <Card className="animate-fade-up lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <CardTitle className="text-base">
                {t("settings.discarded.heading")}
              </CardTitle>
            </div>
            <CardDescription>{t("settings.discarded.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 sm:pt-0">
            <Button variant="outline" onClick={onOpenDiscarded}>
              {t("settings.discarded.open")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Access control — informational. Sign-in is governed at the intranet
          level, so domains and admins are shown read-only here. */}
      <Card className="animate-fade-up lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/20 text-signal">
              <Building2 className="h-4 w-4" />
            </span>
            <CardTitle className="text-base">
              {t("settings.access.heading")}
            </CardTitle>
          </div>
          <CardDescription>{t("settings.access.hint")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 sm:pt-0">
          {access === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-fg">
                  {t("settings.access.domainsLabel")}
                </p>
                {access.allowedDomains.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.access.noDomains")}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {access.allowedDomains.map(domain => (
                      <Badge key={domain} variant="muted">
                        {domain}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("settings.access.note")}
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-fg">
                  {t("settings.access.adminsLabel")}
                </p>
                {access.adminEmails.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("settings.access.noAdmins")}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {access.adminEmails.map(email => (
                      <Badge key={email} variant="muted">
                        {email}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("settings.access.adminsHint")}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
