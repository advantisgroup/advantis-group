"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { addDaysIso, isoToday } from "@/lib/absences";
import { formatIsoDate } from "@/lib/format";
import { HOLIDAY_REGIONS, type HolidayRegion } from "@/lib/holidays";

const NATIONWIDE = "nationwide";

/**
 * Admins set which state's public holidays apply and add office closures
 * (a company holiday, the days between Christmas and New Year). Both show up
 * in the calendar and the absence planner.
 */
export function DaysOffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Calendar");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const handleError = useErrorHandler();
  const today = isoToday();
  const data = useQuery(
    api.org.daysOff.inRange,
    open ? { start: today, end: addDaysIso(today, 3 * 365) } : "skip",
  );
  const setRegion = useMutation(api.org.daysOff.setRegion);
  const addClosure = useMutation(api.org.daysOff.addClosure);
  const removeClosure = useMutation(api.org.daysOff.removeClosure);

  const [title, setTitle] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [busy, setBusy] = useState(false);

  async function changeRegion(value: string) {
    try {
      await setRegion({ region: value === NATIONWIDE ? undefined : value });
      toast.success(t("daysOffRegionSaved"));
    } catch (e) {
      handleError(e);
    }
  }

  async function add() {
    setBusy(true);
    try {
      await addClosure({ title, startDate: start, endDate: end < start ? start : end });
      setTitle("");
      toast.success(t("closureAdded"));
    } catch (e) {
      handleError(e, t("closureAddFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: Id<"officeClosures">) {
    try {
      await removeClosure({ id });
      toast.success(t("closureRemoved"));
    } catch (e) {
      handleError(e);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("daysOffTitle")}
      description={t("daysOffDescription")}
      contentClassName="max-w-lg"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {tc("close")}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("daysOffRegion")}</label>
          <Select value={data?.region ?? NATIONWIDE} onValueChange={(v) => void changeRegion(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NATIONWIDE}>{t("regionNationwide")}</SelectItem>
              {HOLIDAY_REGIONS.map((region: HolidayRegion) => (
                <SelectItem key={region} value={region}>
                  {t(`region.${region}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("daysOffRegionHint")}</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{t("closuresTitle")}</p>
          {data && data.closures.length > 0 ? (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
              {data.closures.map((c) => (
                <li key={c._id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatIsoDate(c.startDate, locale)}
                      {c.endDate !== c.startDate && ` – ${formatIsoDate(c.endDate, locale)}`}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("closureRemove", { title: c.title })}
                    className="text-muted-foreground"
                    onClick={() => void remove(c._id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("closuresEmpty")}</p>
          )}
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("closureTitlePlaceholder")}
              aria-label={t("closureTitle")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-auto flex-1"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
                aria-label={t("closureFrom")}
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="date"
                className="w-auto flex-1"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                aria-label={t("closureTo")}
              />
              <Button disabled={busy || !title.trim() || !start} onClick={() => void add()}>
                {t("closureAdd")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
