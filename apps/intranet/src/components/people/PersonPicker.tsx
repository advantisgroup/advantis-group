"use client";

import { type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";

import { PersonLink } from "@/components/profile/PersonLink";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The shape every picker shows — `lib/profile.ts`'s `ProfileOption`. */
export type PersonOption = FunctionReturnType<typeof api.people.users.options>[number];

type PersonId = Id<"users">;

/** Accent-blind, so "muller" finds "Müller". */
function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matches(person: PersonOption, query: string) {
  return [person.name, person.email, person.jobTitle, person.department].some(
    (field) => field && fold(field).includes(query),
  );
}

export function PersonAvatar({
  person,
  className,
}: {
  person: Pick<PersonOption, "name" | "email" | "avatarUrl">;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt={person.name} />}
      <AvatarFallback className="text-xs">{initials(person.name, person.email)}</AvatarFallback>
    </Avatar>
  );
}

/** Avatar, name (opening their profile) and position — how a linked account
 *  reads anywhere outside a picker. */
export function PersonChip({ person, className }: { person: PersonOption; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <PersonAvatar person={person} />
      <div className="min-w-0">
        <PersonLink userId={person.userId} className="block text-sm font-medium">
          {person.name}
        </PersonLink>
        <p className="truncate text-xs text-muted-foreground">
          {[person.jobTitle, person.department].filter(Boolean).join(" · ") || person.email}
        </p>
      </div>
    </div>
  );
}

/**
 * Search box plus a list of people — the body of `PersonPicker`, and used
 * straight in dialogs that pick several people at once (new chat group,
 * sharing a draft). Arrow keys and Enter work from the search box.
 */
export function PersonList({
  people,
  selected,
  onSelect,
  multiple = false,
  noneLabel,
  onNone,
  hint,
  isDisabled,
  autoFocus = false,
  className,
  listClassName,
}: {
  people: PersonOption[] | undefined;
  selected: PersonId | null | ReadonlySet<string>;
  onSelect: (person: PersonOption) => void;
  multiple?: boolean;
  /** Adds a first row that clears the choice. */
  noneLabel?: string;
  onNone?: () => void;
  /** A short badge after someone's name, e.g. "linked to Anna". */
  hint?: (person: PersonOption) => ReactNode;
  isDisabled?: (person: PersonOption) => boolean;
  autoFocus?: boolean;
  className?: string;
  listClassName?: string;
}) {
  const t = useTranslations("Common.personPicker");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const isSelected = (id: PersonId) =>
    selected instanceof Set ? selected.has(id) : selected === id;

  const filtered = useMemo(() => {
    const query = fold(search.trim());
    return (people ?? []).filter((person) => !query || matches(person, query));
  }, [people, search]);

  const showNone = Boolean(noneLabel && onNone && !search.trim());
  const rowCount = filtered.length + (showNone ? 1 : 0);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(index: number) {
    if (showNone && index === 0) return onNone?.();
    const person = filtered[index - (showNone ? 1 : 0)];
    if (person && !isDisabled?.(person)) onSelect(person);
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setActive(0);
          }}
          placeholder={t("search")}
          aria-label={t("search")}
          className="pl-9"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, rowCount - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && rowCount > 0) {
              event.preventDefault();
              choose(active);
            }
          }}
        />
      </div>
      <ul
        ref={listRef}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        className={cn("mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain", listClassName)}
      >
        {showNone && (
          <li>
            <button
              type="button"
              data-index={0}
              role="option"
              aria-selected={selected === null}
              onClick={() => choose(0)}
              onMouseMove={() => setActive(0)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground",
                active === 0 && "bg-accent",
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border text-xs">
                –
              </span>
              <span className="flex-1">{noneLabel}</span>
              {selected === null && <Check className="size-4 text-foreground" />}
            </button>
          </li>
        )}
        {people === undefined ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">…</li>
        ) : filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</li>
        ) : (
          filtered.map((person, i) => {
            const index = i + (showNone ? 1 : 0);
            const checked = isSelected(person.userId);
            const disabled = isDisabled?.(person) ?? false;
            const detail = [person.jobTitle, person.department].filter(Boolean).join(" · ");
            const badge = hint?.(person);
            return (
              <li key={person.userId}>
                <button
                  type="button"
                  data-index={index}
                  role="option"
                  aria-selected={checked}
                  aria-disabled={disabled || undefined}
                  onClick={() => choose(index)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    active === index && "bg-accent",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <PersonAvatar person={person} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{person.name}</span>
                      {badge && (
                        <Badge variant="muted" className="shrink-0 text-[10px]">
                          {badge}
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {detail ? `${detail} · ${person.email}` : person.email}
                    </span>
                  </span>
                  {multiple ? (
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        checked
                          ? "border-foreground bg-foreground text-background"
                          : "border-border",
                      )}
                    >
                      {checked && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  ) : (
                    checked && <Check className="size-4 shrink-0" />
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

/**
 * The one way to choose a single intranet person: shows who's picked with
 * their avatar, and opens a searchable list — anchored under the field on
 * desktop, a tall bottom sheet on phones so rows are big enough to tap.
 *
 * Reads `api.people.users.options` unless `people` is passed (the
 * Performance area has no intranet session and brings its own list).
 */
export function PersonPicker({
  value,
  onChange,
  people: peopleOverride,
  exclude,
  noneLabel,
  placeholder,
  label,
  hint,
  isDisabled,
  disabled = false,
  trigger,
  className,
  align = "start",
}: {
  value: PersonId | null | undefined;
  onChange: (userId: PersonId | null, person: PersonOption | null) => void;
  people?: PersonOption[];
  exclude?: readonly (string | null | undefined)[];
  /** Offers clearing the choice, under this label. */
  noneLabel?: string;
  placeholder?: string;
  /** Title of the phone sheet, and the field's accessible name. */
  label?: string;
  hint?: (person: PersonOption) => ReactNode;
  isDisabled?: (person: PersonOption) => boolean;
  disabled?: boolean;
  /** Replaces the default field, e.g. a compact property button. */
  trigger?: ReactElement;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const t = useTranslations("Common.personPicker");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const fetched = useQuery(api.people.users.options, peopleOverride ? "skip" : {});
  const all = peopleOverride ?? fetched;

  const people = useMemo(
    () => (exclude?.length ? all?.filter((p) => !exclude.includes(p.userId)) : all),
    [all, exclude],
  );
  const selected = all?.find((p) => p.userId === value) ?? null;
  const title = label ?? placeholder ?? t("placeholder");

  function pick(person: PersonOption | null) {
    setOpen(false);
    if ((person?.userId ?? null) !== (value ?? null)) onChange(person?.userId ?? null, person);
  }

  const field = trigger ?? (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "h-auto min-h-10 w-full justify-between gap-2 py-1.5 font-normal md:min-h-9",
        className,
      )}
    >
      {selected ? (
        <span className="flex min-w-0 items-center gap-2">
          <PersonAvatar person={selected} className="size-6" />
          <span className="truncate">{selected.name}</span>
          {selected.jobTitle && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {selected.jobTitle}
            </span>
          )}
        </span>
      ) : (
        <span className="truncate text-muted-foreground">
          {value && all === undefined ? "…" : (placeholder ?? noneLabel ?? t("placeholder"))}
        </span>
      )}
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
    </Button>
  );

  const list = (
    <PersonList
      people={people}
      selected={value ?? null}
      onSelect={pick}
      noneLabel={noneLabel}
      onNone={noneLabel ? () => pick(null) : undefined}
      hint={hint}
      isDisabled={isDisabled}
      autoFocus={!isMobile}
      className="h-full"
    />
  );

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Trigger asChild disabled={disabled}>
          {field}
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[8px]" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl bg-card shadow-overlay outline-none"
          >
            <div className="flex shrink-0 items-center justify-center pb-1 pt-3">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <Drawer.Title className="shrink-0 px-5 pb-3 pt-2 font-display text-lg font-bold">
              {title}
            </Drawer.Title>
            <div
              className="min-h-0 flex-1 px-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            >
              {list}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // `modal` keeps the list scrollable when the picker sits inside a dialog,
  // whose scroll lock would otherwise swallow the wheel.
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild disabled={disabled}>
        {field}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="flex h-[min(24rem,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),20rem)] flex-col p-2"
      >
        {list}
      </PopoverContent>
    </Popover>
  );
}
