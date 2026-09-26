"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { isWithinCallbackHours } from "@advantis/convex/marketing/inquiry";
import { useLocale, useTranslations } from "next-intl";

import { type Checkpoint, CheckpointNote, Checkpoints } from "@/components/account/Checkpoints";
import { Display } from "@/components/frame";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/eden";

import { controlClassName } from "./Field";

type Details = {
  reference: string;
  firstName: string;
  callbackStatus: "requested" | "confirmed" | "cancelled";
  desiredAt?: number;
  callbackConfirmedAt?: number;
  timeZone?: string;
};

type View = "loading" | "invalid" | "ready" | "cancelled" | "rescheduled";

// earliest slot the picker offers is "now", in the local format datetime-local expects
const nowForInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

/**
 * The callback a customer was mailed about: when it is, and the two things
 * they can do about it without signing in — pick another time, or cancel.
 * The cancel link from the mail only opens the confirmation here; a link
 * scanner following it must never cancel anyone's call.
 */
export function CallbackManage() {
  const t = useTranslations("callbackPage");
  const locale = useLocale();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [view, setView] = useState<View>("loading");
  const [details, setDetails] = useState<Details | null>(null);
  const [mode, setMode] = useState<"idle" | "cancel" | "reschedule">(
    params.get("action") === "cancel" ? "cancel" : "idle",
  );
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const format = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }),
    [locale],
  );

  const load = useCallback(async () => {
    if (!token) return setView("invalid");
    const { data, error: failed } = await api.callback.get({ query: { token } });
    if (failed || !data || !("reference" in data)) return setView("invalid");
    setDetails(data as Details);
    setView(data.callbackStatus === "cancelled" ? "cancelled" : "ready");
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    setBusy(true);
    const { data } = await api.callback.cancel.post({ token });
    setBusy(false);
    if (data && "status" in data && data.status === "cancelled") setView("cancelled");
    else setError(t("failed"));
  };

  const reschedule = async () => {
    const desiredAt = new Date(picked).getTime();
    if (
      !picked ||
      Number.isNaN(desiredAt) ||
      desiredAt < Date.now() ||
      !isWithinCallbackHours(desiredAt)
    ) {
      return setError(t("outsideHours"));
    }
    setBusy(true);
    const { data } = await api.callback.reschedule.post({
      token,
      desiredAt,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    if (data && "status" in data && data.status === "requested") {
      setDetails((current) =>
        current
          ? { ...current, desiredAt, callbackConfirmedAt: undefined, callbackStatus: "requested" }
          : current,
      );
      setView("rescheduled");
    } else {
      setError(
        data && "status" in data && data.status === "outside_hours"
          ? t("outsideHours")
          : t("failed"),
      );
    }
  };

  if (view === "loading") {
    return (
      <div aria-busy className="space-y-4">
        <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (view === "invalid" || !details) {
    return (
      <>
        <Display as="h1" size="md">
          {t("invalid.title")}
        </Display>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          {t("invalid.body")}
        </p>
        <Button asChild shape="pill" size="sm" className="mt-8">
          <Link href={{ pathname: "/contact", query: { mode: "callback" } }}>
            {t("newCallback")}
          </Link>
        </Button>
      </>
    );
  }

  const at = details.callbackConfirmedAt ?? details.desiredAt;
  const confirmed = details.callbackStatus === "confirmed";
  const steps: Checkpoint[] =
    view === "cancelled"
      ? [
          { key: "requested", label: t("steps.requested"), state: "done" },
          { key: "cancelled", label: t("steps.cancelled"), state: "skipped" },
        ]
      : [
          { key: "requested", label: t("steps.requested"), state: "done" },
          {
            key: "confirmed",
            label: t("steps.confirmed"),
            meta: confirmed && at ? format.format(at) : undefined,
            state: confirmed ? "done" : "current",
          },
          { key: "call", label: t("steps.call"), state: "upcoming" },
        ];

  return (
    <>
      <p className="text-sm tabular-nums text-muted-foreground">{details.reference}</p>
      <Display as="h1" size="md" className="mt-2">
        {view === "cancelled"
          ? t("cancelled.title")
          : view === "rescheduled"
            ? t("rescheduled.title")
            : t("heading", { name: details.firstName })}
      </Display>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        {view === "cancelled"
          ? t("cancelled.body")
          : view === "rescheduled"
            ? t("rescheduled.body", { when: at ? format.format(at) : "" })
            : at
              ? t(confirmed ? "confirmedFor" : "requestedFor", { when: format.format(at) })
              : null}
      </p>

      <Checkpoints label={t("title")} steps={steps} className="mt-10" />

      {view === "ready" ? (
        mode === "cancel" ? (
          <CheckpointNote
            tone="failed"
            title={t("cancelConfirm")}
            action={
              <>
                <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
                  {t("keep")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  {t("cancel")}
                </Button>
              </>
            }
          >
            {error}
          </CheckpointNote>
        ) : mode === "reschedule" ? (
          <div className="mt-8 border-t border-rule pt-6">
            <label
              htmlFor="callback-new-time"
              className="block text-sm font-medium text-foreground"
            >
              {t("newTime")}
            </label>
            <input
              id="callback-new-time"
              type="datetime-local"
              min={nowForInput()}
              value={picked}
              onChange={(event) => {
                setPicked(event.target.value);
                setError(null);
              }}
              aria-describedby="callback-new-time-hint"
              className={`${controlClassName} mt-2`}
            />
            <p
              id="callback-new-time-hint"
              className={`mt-1.5 text-[13px] ${error ? "text-destructive" : "text-muted-foreground"}`}
            >
              {error ?? t("hours")}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="sm"
                shape="pill"
                disabled={busy || !picked}
                onClick={() => void reschedule()}
              >
                {t("sendTime")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
                {t("back")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap gap-2">
            <Button size="sm" shape="pill" variant="outline" onClick={() => setMode("reschedule")}>
              {t("anotherTime")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>
              {t("cancel")}
            </Button>
          </div>
        )
      ) : (
        <div className="mt-10 flex flex-wrap gap-2">
          <Button asChild size="sm" shape="pill" variant="outline">
            <Link href="/">{t("home")}</Link>
          </Button>
          {view === "cancelled" ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={{ pathname: "/contact", query: { mode: "callback" } }}>
                {t("newCallback")}
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </>
  );
}
