"use client";

import { useEffect, useState } from "react";

import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { downloadCalendarEvent, type RichDateKind, type RichDateValue } from "@/lib/rich-date";

export function RichDatePrompt({
  open,
  onOpenChange,
  value,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RichDateValue;
  summary: string;
}) {
  const t = useTranslations("RichText");
  const isMobile = useIsMobile();
  const [kind, setKind] = useState<RichDateKind | "">(value.kind ?? "");
  const [description, setDescription] = useState(value.description ?? "");
  const [location, setLocation] = useState(value.location ?? "");

  useEffect(() => {
    if (!open) return;
    setKind(value.kind ?? "");
    setDescription(value.description ?? "");
    setLocation(value.location ?? "");
  }, [open, value]);

  function add() {
    if (!kind || !description.trim()) return;
    downloadCalendarEvent(
      {
        ...value,
        kind,
        description: description.trim(),
        ...(location.trim() ? { location: location.trim() } : {}),
      },
      summary,
    );
    onOpenChange(false);
  }

  const fields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("eventType")}</Label>
        <Select value={kind} onValueChange={(next) => setKind(next as RichDateKind)}>
          <SelectTrigger>
            <SelectValue placeholder={t("selectEventType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event">{t("kindEvent")}</SelectItem>
            <SelectItem value="deadline">{t("kindDeadline")}</SelectItem>
            <SelectItem value="reminder">{t("kindReminder")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rich-date-description">{t("description")}</Label>
        <Textarea
          id="rich-date-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rich-date-location">{t("locationOptional")}</Label>
        <Input
          id="rich-date-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </div>
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        {t("cancel")}
      </Button>
      <Button onClick={add} disabled={!kind || !description.trim()}>
        <CalendarPlus className="mr-1.5 size-4" />
        {t("addToCalendar")}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <MobileDrawer
        open={open}
        onOpenChange={onOpenChange}
        ariaLabel={t("completeDateTitle")}
        className="h-[78vh]"
      >
        <div className="border-b border-border/70 px-5 pb-4">
          <p className="font-display text-lg font-semibold">{t("completeDateTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("completeDateDescription")}</p>
        </div>
        <div className="flex-1 px-5 py-4">{fields}</div>
        <div className="flex shrink-0 gap-2 border-t border-border/70 px-5 py-4 [&>button]:flex-1">
          {actions}
        </div>
      </MobileDrawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("completeDateTitle")}</DialogTitle>
          <DialogDescription>{t("completeDateDescription")}</DialogDescription>
        </DialogHeader>
        {fields}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
