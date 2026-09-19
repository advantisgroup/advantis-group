"use client";

import { InfoTip } from "@/components/activity/InfoTip";
import { AttachmentList } from "@/components/attachments/AttachmentList";
import { type useAttachmentUpload } from "@/components/attachments/useAttachmentUpload";
import { Mark } from "@/components/branding/ProviderMark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Draft, CATEGORY_MAX_LENGTH, relevantDateHasValidRange } from "@/lib/announcements";
import { initials } from "@/lib/format";
import { type RichDateKind, richDateTimestampFromInput } from "@/lib/rich-date";
import { formatFileSize, MAX_ATTACHMENT_BYTES } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Building2, CalendarDays, CalendarPlus, Paperclip, Search, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

/** One labelled group in the Options panel. Rules rather than cards: five
 *  stacked bordered boxes inside a ~30rem panel read as clutter, and the
 *  nested field borders inside them made it worse. */
function OptionsSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground refreshed:font-medium refreshed:normal-case refreshed:tracking-normal">
        {label}
      </Label>
      {children}
    </section>
  );
}

export function ComposerOptionsFields({
  draft,
  set,
  editing,
  departments,
  peopleSearch,
  setPeopleSearch,
  filteredPeople,
  selectedPeople,
  toggleAudienceUser,
  toggleAudienceDepartment,
  audienceCount,
  existingCategories,
  attachmentUpload,
  addFiles,
  onOpenOneDrivePicker,
  onInsertRelevantDate,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  editing: boolean;
  departments: string[];
  peopleSearch: string;
  setPeopleSearch: (v: string) => void;
  filteredPeople: { _id: string; name: string; email: string; avatar?: string | null }[];
  selectedPeople: { _id: string; name: string; email: string; avatar?: string | null }[];
  toggleAudienceUser: (userId: string) => void;
  toggleAudienceDepartment: (department: string) => void;
  audienceCount: number | undefined;
  existingCategories: string[];
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
  addFiles: (files: File[]) => boolean;
  onOpenOneDrivePicker: () => void;
  onInsertRelevantDate: () => void;
}) {
  const t = useTranslations("Announcements");
  const tc = useTranslations("Common");
  const tr = useTranslations("RichText");
  const [dateTextPromptOpen, setDateTextPromptOpen] = useState(false);
  const relevantDateRangeValid = relevantDateHasValidRange(draft.relevantDate);
  const relevantDateStartTimestamp = draft.relevantDate?.startAt
    ? richDateTimestampFromInput(draft.relevantDate.startAt, draft.relevantDate.allDay)
    : undefined;
  const relevantDateEndTimestamp = draft.relevantDate?.endAt
    ? richDateTimestampFromInput(draft.relevantDate.endAt, draft.relevantDate.allDay)
    : undefined;
  const relevantDateStartValid =
    relevantDateStartTimestamp === undefined || Number.isFinite(relevantDateStartTimestamp);
  const relevantDateEndValid =
    relevantDateEndTimestamp === undefined || Number.isFinite(relevantDateEndTimestamp);

  const matchingCategories = existingCategories.filter((c) => {
    const q = draft.category.trim().toLowerCase();
    return !q || (c.toLowerCase().includes(q) && c.toLowerCase() !== q);
  });

  function updateRelevantDate(
    patch: Partial<NonNullable<Draft["relevantDate"]>>,
    promptForText = false,
  ) {
    set("relevantDate", {
      startAt: "",
      endAt: "",
      allDay: false,
      kind: "",
      description: "",
      location: "",
      ...draft.relevantDate,
      id: draft.relevantDate?.id ?? crypto.randomUUID(),
      ...patch,
    });
    if (promptForText) setDateTextPromptOpen(true);
  }

  function toggleRelevantDateAllDay(allDay: boolean) {
    const value = draft.relevantDate;
    if (!value) return;
    updateRelevantDate({
      allDay,
      startAt: allDay
        ? value.startAt.slice(0, 10)
        : value.startAt
          ? `${value.startAt.slice(0, 10)}T09:00`
          : "",
      endAt: value.endAt
        ? allDay
          ? value.endAt.slice(0, 10)
          : `${value.endAt.slice(0, 10)}T10:00`
        : "",
    });
  }

  return (
    <div className="space-y-4">
      <OptionsSection label={t("category")}>
        <Input
          placeholder={t("categoryPlaceholder")}
          value={draft.category}
          onChange={(e) => set("category", e.target.value)}
          maxLength={CATEGORY_MAX_LENGTH}
        />
        {matchingCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {matchingCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("category", c)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/60 hover:bg-accent hover:text-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </OptionsSection>

      <OptionsSection label={t("audience")}>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-background px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" />
            {t("everyone")}
          </span>
          <Checkbox
            checked={draft.audienceKind === "all"}
            onCheckedChange={(v) => set("audienceKind", v === true ? "all" : "mixed")}
          />
        </label>

        {draft.audienceKind === "mixed" && (
          <div className="space-y-3 rounded-md border border-border/70 bg-background p-3">
            {departments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("departmentsLabel")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {departments.map((d) => {
                    const active = draft.audienceDepartments.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleAudienceDepartment(d)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-transparent bg-foreground text-background"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <Building2 className="size-3" />
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className={cn(
                "space-y-1.5",
                departments.length > 0 && "border-t border-border/60 pt-3",
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">{t("specificPeople")}</p>

              {selectedPeople.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPeople.map((p) => (
                    <span
                      key={p._id}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-accent/60 py-0.5 pl-1 pr-1.5 text-xs font-medium"
                    >
                      <Avatar className="size-4">
                        {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                        <AvatarFallback className="text-[8px]">
                          {initials(p.name, p.email)}
                        </AvatarFallback>
                      </Avatar>
                      {p.name}
                      <button
                        type="button"
                        aria-label={tc("delete")}
                        onClick={() => toggleAudienceUser(p._id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tc("search")}
                  value={peopleSearch}
                  onChange={(e) => setPeopleSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border/60">
                {filteredPeople.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">{tc("noResults")}</p>
                ) : (
                  filteredPeople.map((p) => (
                    <label
                      key={p._id}
                      className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-accent"
                    >
                      <Checkbox
                        checked={draft.audienceUserIds.includes(p._id)}
                        onCheckedChange={() => toggleAudienceUser(p._id)}
                      />
                      <Avatar className="size-6 shrink-0">
                        {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
                        <AvatarFallback className="text-[10px]">
                          {initials(p.name, p.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.email}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {audienceCount !== undefined && (
          <p className="text-xs text-muted-foreground">
            {t("willReach", { count: audienceCount })}
          </p>
        )}
      </OptionsSection>

      <OptionsSection label={t("options")}>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox checked={draft.pinned} onCheckedChange={(v) => set("pinned", v === true)} />
            {t("pin")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={draft.requiresAck ?? false}
              onCheckedChange={(v) => set("requiresAck", v === true)}
            />
            {t("requireAck")}
          </label>
        </div>
      </OptionsSection>

      {!editing && (
        <OptionsSection label={t("attachments")}>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              <Paperclip className="h-4 w-4" />
              {t("attachFile")}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={onOpenOneDrivePicker}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mark provider="onedrive" className="size-4" />
              {tc("fromOneDrive")}
            </button>
          </div>
          {attachmentUpload.entries.length > 0 && (
            <div className="space-y-1.5">
              <AttachmentList
                entries={attachmentUpload.entries}
                uploading={attachmentUpload.uploading}
                onRemove={attachmentUpload.remove}
                removeLabel={tc("delete")}
              />
              <p className="text-[11px] text-muted-foreground">
                {formatFileSize(attachmentUpload.totalSize)} /{" "}
                {formatFileSize(MAX_ATTACHMENT_BYTES)}
              </p>
            </div>
          )}
        </OptionsSection>
      )}

      <OptionsSection label={t("relevantDate")}>
        {!draft.relevantDate ? (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => updateRelevantDate({})}
          >
            <CalendarDays className="mr-2 size-4" />
            {t("addRelevantDate")}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("relevantDateHint")}</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={draft.relevantDate.allDay}
                onCheckedChange={(checked) => toggleRelevantDateAllDay(checked === true)}
              />
              {tr("allDay")}
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("starts")}</Label>
                <Input
                  type={draft.relevantDate.allDay ? "date" : "datetime-local"}
                  value={draft.relevantDate.startAt}
                  onChange={(event) =>
                    updateRelevantDate(
                      { startAt: event.target.value },
                      !draft.relevantDate?.startAt && !!event.target.value,
                    )
                  }
                  aria-invalid={!relevantDateStartValid}
                />
                {!relevantDateStartValid && !draft.relevantDate.allDay && (
                  <p className="text-xs text-destructive">{tr("invalidBerlinTime")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("endsOptional")}</Label>
                <Input
                  type={draft.relevantDate.allDay ? "date" : "datetime-local"}
                  value={draft.relevantDate.endAt}
                  onChange={(event) => updateRelevantDate({ endAt: event.target.value })}
                  aria-invalid={!relevantDateEndValid || !relevantDateRangeValid}
                />
                {!relevantDateEndValid && !draft.relevantDate.allDay && (
                  <p className="text-xs text-destructive">{tr("invalidBerlinTime")}</p>
                )}
                {relevantDateStartValid && relevantDateEndValid && !relevantDateRangeValid && (
                  <p className="text-xs text-destructive">{tr("endAfterStart")}</p>
                )}
              </div>
            </div>
            {!draft.relevantDate.allDay && (
              <p className="text-xs text-muted-foreground">{tr("berlinTimeZone")}</p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tr("eventTypeOptional")}</Label>
              <Select
                value={draft.relevantDate.kind || undefined}
                onValueChange={(kind) => updateRelevantDate({ kind: kind as RichDateKind })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tr("selectEventType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">{tr("kindEvent")}</SelectItem>
                  <SelectItem value="deadline">{tr("kindDeadline")}</SelectItem>
                  <SelectItem value="reminder">{tr("kindReminder")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tr("descriptionOptional")}</Label>
              <Textarea
                value={draft.relevantDate.description}
                onChange={(event) => updateRelevantDate({ description: event.target.value })}
                placeholder={tr("descriptionPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tr("locationOptional")}</Label>
              <Input
                value={draft.relevantDate.location}
                onChange={(event) => updateRelevantDate({ location: event.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Popover open={dateTextPromptOpen} onOpenChange={setDateTextPromptOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!draft.relevantDate.startAt}
                  >
                    <CalendarPlus className="mr-1.5 size-4" />
                    {t("insertRelevantDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <p className="text-sm font-medium">{t("insertRelevantDatePrompt")}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onInsertRelevantDate();
                        setDateTextPromptOpen(false);
                      }}
                    >
                      {t("addToText")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDateTextPromptOpen(false)}
                    >
                      {t("notNow")}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  set("relevantDate", null);
                  setDateTextPromptOpen(false);
                }}
              >
                <X className="mr-1.5 size-4" />
                {t("removeRelevantDate")}
              </Button>
            </div>
          </div>
        )}
      </OptionsSection>

      <OptionsSection label={t("scheduling")}>
        <div className="grid grid-cols-1 gap-3">
          {!editing && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {t("publishAtLabel")}
                <InfoTip text={t("publishAtHint")} />
              </Label>
              <Input
                type="datetime-local"
                value={draft.publishAt}
                onChange={(e) => set("publishAt", e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("expiresAtLabel")}</Label>
            <Input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
            />
          </div>
        </div>
      </OptionsSection>
    </div>
  );
}
