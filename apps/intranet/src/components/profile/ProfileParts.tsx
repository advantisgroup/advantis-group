"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials, roleLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useQuery } from "convex/react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

export function useUser(userId: Id<"users"> | null) {
  return useQuery(api.people.users.get, userId ? { userId } : "skip");
}

/** A small labelled section so the profile reads like a tidy info card. */
export function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The single body card every profile detail lives in — one inset panel with
 * hairline-separated `Section`s. Rows inside a section are plain lines, not
 * more bordered boxes: a box in a box in a card is what made this feel
 * cramped. Several sections render `null` when empty, which the divider
 * handles for free.
 */
export function InfoPanel({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-panel-2/40 [&>*]:px-4 [&>*]:py-4">
      {children}
    </div>
  );
}

/** Every detail row leads with the same tile, so rows line up whatever follows. */
export function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
      {children}
    </span>
  );
}

/** A labelled control in the management rail — label over control, so the
 *  control gets the rail's full width rather than whatever the label leaves. */
export function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** One `label: value` line in the profile's details section. */
export function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 text-sm">
      <IconTile>{icon}</IconTile>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** A single contact line: icon, a mailto:/tel: link, and a copy button. */
export function ContactRow({
  icon,
  value,
  href,
  onCopy,
}: {
  icon: ReactNode;
  value: string;
  href: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 text-sm">
      <IconTile>{icon}</IconTile>
      <a href={href} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">
        {value}
      </a>
      <Button
        size="icon-sm"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={onCopy}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

export function PersonRow({
  person,
}: {
  person: { name: string; jobTitle: string | null; avatar: string | null };
}) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <Avatar className="size-8 shrink-0">
        {person.avatar && <AvatarImage src={person.avatar} alt={person.name} />}
        <AvatarFallback className="text-[10px]">{initials(person.name, "")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        {person.jobTitle && (
          <p className="truncate text-xs text-muted-foreground">{person.jobTitle}</p>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", className)}
        style={{ width: `${total ? (value / total) * 100 : 0}%` }}
      />
    </div>
  );
}

/** A settings-style list: one bordered group, rows split by hairlines. */
export function ActionGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
      {children}
    </div>
  );
}

/** One action in an `ActionGroup`. Wraps instead of truncating — German labels
 *  ("Geschäftsführungs-Zugriff gewähren") run 2-3x longer than English ones. */
export function ActionRow({
  icon,
  children,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive ? "text-destructive" : "[&_svg]:text-muted-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/**
 * The role badge doubles as an admin-only editor for the cosmetic per-user
 * `roleLabel` override (e.g. rendering "Geschäftsführerin" for an admin whose
 * permissions stay exactly admin — this never touches `role` itself).
 */
export function RoleBadge({
  member,
  isAdmin,
  tRoles,
  onSave,
  className,
}: {
  member: { role: Role; roleLabel?: string | null };
  isAdmin: boolean;
  tRoles: (role: string) => string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(member.roleLabel ?? "");

  if (!isAdmin) {
    return (
      <Badge variant="muted" className={className}>
        {roleLabel(member, tRoles)}
      </Badge>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(member.roleLabel ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge variant="muted" className={cn("cursor-pointer", className)}>
            {roleLabel(member, tRoles)}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <p className="text-xs font-medium text-muted-foreground">{t("roleLabelHint")}</p>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={tRoles(member.role)}
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue("");
              onSave("");
              setOpen(false);
            }}
          >
            {t("roleLabelReset")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(value);
              setOpen(false);
            }}
          >
            {tc("save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
