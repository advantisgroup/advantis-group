"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useIntranetApiClient } from "@/lib/api-client";
import { reportClientError } from "@/lib/errors";

/**
 * Shared clock-in/out state, polling, and actions — extracted so the header
 * pill (`ClockodoHeaderControl`) and the Dashboard's clock card no longer
 * run two independent 60s-poll loops with their own copies of the same
 * type, which had already drifted (the header ticked a live elapsed time,
 * the Dashboard showed a static "since HH:MM").
 */

export type ClockStatus = "working" | "break" | "clockedOut";

export interface ClockodoClockState {
  accountName: string;
  status: ClockStatus;
  since: string | null;
  entryId: number | null;
}

export interface ClockOption {
  id: number;
  name: string;
}

/** "Xh Ym" (or just "Ym" under an hour) elapsed since `since`, or null when
 * there's nothing running / the timestamp doesn't parse. */
export function elapsedSince(since: string | null, now: number): string | null {
  if (!since) return null;
  const milliseconds = now - Date.parse(since);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** One color per status, shared so the header pill and Dashboard card read
 * as the same visual language instead of two independently hardcoded
 * palettes (the Dashboard card previously had no distinct "break" color at
 * all). */
export function clockStatusClassName(status: ClockStatus): string {
  switch (status) {
    case "working":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "break":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "clockedOut":
      return "bg-muted text-muted-foreground";
  }
}

/** Polls `/clockodo/clock/me` every 60s (skipped entirely when `enabled` is
 * false — e.g. no personal Clockodo account to poll) and ticks a `now`
 * timestamp every 30s so `elapsedSince` displays stay live. */
export function useClockodoClock(enabled: boolean) {
  const api = useIntranetApiClient();
  const [state, setState] = useState<ClockodoClockState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // `api` (from useIntranetApiClient) isn't guaranteed referentially stable across
  // renders — if it isn't, a `refresh` dependency here re-triggers this
  // effect on every render (fetch -> setState -> re-render -> new `eden` ->
  // repeat), hammering /clockodo/clock/me far faster than the 60s interval
  // suggests. Read `eden` via a ref instead so the effect only depends on
  // `enabled`, which changes rarely.
  const apiRef = useRef(api);
  apiRef.current = api;

  const refresh = useCallback(async () => {
    try {
      const data = await apiRef.current.unwrap(apiRef.current.eden.clockodo.clock.me.get());
      setState(data);
    } catch (error) {
      reportClientError(error, "clockodo.clock.me");
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const refreshId = window.setInterval(() => void refresh(), 60_000);
    const clockId = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [enabled, refresh]);

  return { state, now, refresh };
}

/** Start/stop actions plus the customer/service picker state a "start"
 * action needs — shared so the header popover and the Dashboard's dialog
 * present the exact same picker instead of two separate implementations. */
export function useClockodoActions(state: ClockodoClockState | null, refresh: () => Promise<void>) {
  const t = useTranslations("Absences");
  const api = useIntranetApiClient();
  const [options, setOptions] = useState<{
    customers: ClockOption[];
    services: ClockOption[];
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(customer: number, service: number) {
    setBusy(true);
    try {
      await api.unwrap(
        api.eden.clockodo.clock.me.post({
          customerId: customer,
          serviceId: service,
        }),
      );
      setPickerOpen(false);
      await refresh();
      toast.success(t("clockStarted"));
    } catch {
      toast.error(t("clockActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function openStart() {
    setBusy(true);
    try {
      let opts = options;
      if (!opts) {
        const data = await api.unwrap(api.eden.clockodo.clock.options.get());
        opts = data;
        setOptions(data);
      }
      // Nothing to choose between — just start the clock instead of making
      // the person pick from single-item dropdowns.
      if (opts.customers.length === 1 && opts.services.length === 1) {
        await start(opts.customers[0].id, opts.services[0].id);
        return;
      }
      setCustomerId(opts.customers.length === 1 ? String(opts.customers[0].id) : "");
      setServiceId(opts.services.length === 1 ? String(opts.services[0].id) : "");
      setPickerOpen(true);
    } catch (error) {
      reportClientError(error, "clockodo.clock.options");
      toast.error(t("clockActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!state?.entryId) return;
    setBusy(true);
    try {
      await api.unwrap(api.eden.clockodo.clock.me({ entryId: String(state.entryId) }).delete());
      await refresh();
      toast.success(t("clockStopped"));
    } catch {
      toast.error(t("clockActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  return {
    options,
    pickerOpen,
    setPickerOpen,
    customerId,
    setCustomerId,
    serviceId,
    setServiceId,
    busy,
    openStart,
    start,
    stop,
  };
}
