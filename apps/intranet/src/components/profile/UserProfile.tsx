"use client";

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { type Role } from "@advantis/types";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Building2,
  CalendarClock,
  Copy,
  Hash,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  UploadCloud,
  UserMinus,
  Users2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import {
  useCurrentUser,
  useIsAdmin,
  useIsManager,
} from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  useConfirm,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNow } from "@/lib/activity/useNow";
import { formatIsoDate, initials } from "@/lib/format";
import { TEAMS, teamColor, teamLabelKey } from "@/lib/teams";
import { cn } from "@/lib/utils";

type ProfileUser = NonNullable<ReturnType<typeof useUser>>;

function useUser(userId: Id<"users"> | null) {
  return useQuery(api.users.get, userId ? { userId } : "skip");
}

/** A small labelled section so the profile reads like a tidy info card. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: Role;
  onChange: (r: Role) => void;
}) {
  const t = useTranslations("Roles");
  return (
    <Select value={value} onValueChange={v => onChange(v as Role)}>
      <SelectTrigger className="h-8 w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="employee">{t("employee")}</SelectItem>
        <SelectItem value="manager">{t("manager")}</SelectItem>
        <SelectItem value="admin">{t("admin")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TeamsEditor({
  userId,
  teams,
}: {
  userId: Id<"users">;
  teams: string[];
}) {
  const t = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const setTeams = useMutation(api.users.setTeams);
  const handleError = useErrorHandler();

  function toggle(id: string) {
    const next = teams.includes(id)
      ? teams.filter(x => x !== id)
      : [...teams, id];
    setTeams({ userId, teams: next }).catch(handleError);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Users2 className="size-3.5" />
          {t("teams")}
          {teams.length > 0 && (
            <span className="ml-0.5 flex items-center gap-1">
              {teams.map(id => (
                <span
                  key={id}
                  className={cn("size-1.5 rounded-full", teamColor(id))}
                />
              ))}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("teams")}</span>
          <span className="text-xs font-normal tabular-nums text-muted-foreground">
            {teams.length}/{TEAMS.length}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TEAMS.map(team => {
          const checked = teams.includes(team.id);
          return (
            <DropdownMenuCheckboxItem
              key={team.id}
              checked={checked}
              onCheckedChange={() => toggle(team.id)}
              onSelect={e => e.preventDefault()}
              className="gap-2 py-1.5"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-opacity",
                  teamColor(team.id),
                  checked ? "opacity-100" : "opacity-40"
                )}
              />
              <span className="flex-1">{tTeams(team.labelKey)}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A single contact line: icon + value, optionally a mailto:/tel: link + copy. */
function ContactRow({
  icon,
  value,
  href,
  onCopy,
}: {
  icon: ReactNode;
  value: string;
  href?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      {href ? (
        <a
          href={href}
          className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate">{value}</span>
      )}
      {onCopy && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={onCopy}
        >
          <Copy className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** How recent a presence heartbeat still counts as "online". */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function Organisation({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Profile");
  const org = useQuery(api.users.orgContext, { userId });
  if (!org || (!org.manager && org.reports.length === 0)) return null;

  const personRow = (p: {
    _id: string;
    name: string;
    jobTitle: string | null;
    avatar: string | null;
  }) => (
    <div
      key={p._id}
      className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2"
    >
      <Avatar className="size-7 shrink-0">
        {p.avatar && <AvatarImage src={p.avatar} alt={p.name} />}
        <AvatarFallback className="text-[10px]">
          {initials(p.name, "")}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {p.name}
      </span>
      {p.jobTitle && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {p.jobTitle}
        </span>
      )}
    </div>
  );

  return (
    <Section label={t("organisation")}>
      <div className="space-y-2">
        {org.manager && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("manager")}</p>
            {personRow(org.manager)}
          </div>
        )}
        {org.reports.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("reports", { count: org.reports.length })}
            </p>
            <div className="space-y-1">{org.reports.map(personRow)}</div>
          </div>
        )}
      </div>
    </Section>
  );
}

function MutualConversations({
  userId,
  onNavigate,
}: {
  userId: Id<"users">;
  onNavigate: () => void;
}) {
  const t = useTranslations("Profile");
  const router = useRouter();
  const mutual = useQuery(api.chat.mutualConversations, {
    otherUserId: userId,
  });

  if (!mutual || mutual.length === 0) return null;

  return (
    <Section label={t("mutual")}>
      <div className="space-y-1">
        {mutual.map(c => (
          <button
            key={c._id}
            type="button"
            onClick={() => {
              router.push(`/chat?c=${c._id}`);
              onNavigate();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent/50"
          >
            {c.type === "dm" ? (
              <Avatar className="size-7 shrink-0">
                {c.avatar && <AvatarImage src={c.avatar} alt={c.title} />}
                <AvatarFallback className="text-[10px]">
                  {initials(c.title, "")}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-panel-2 text-muted-foreground">
                <Hash className="size-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {c.title}
            </span>
            {c.type === "group" && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("memberCount", { count: c.memberCount })}
              </span>
            )}
          </button>
        ))}
      </div>
    </Section>
  );
}

function UpcomingAbsences({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("Profile");
  const tAbs = useTranslations("Absences");
  const locale = useLocale();
  const absences = useQuery(api.absences.upcomingForUser, { userId });

  if (!absences || absences.length === 0) return null;

  return (
    <Section label={t("upcoming")}>
      <div className="space-y-1.5">
        {absences.map(a => {
          const range =
            a.startDate === a.endDate
              ? formatIsoDate(a.startDate, locale)
              : `${formatIsoDate(a.startDate, locale)} – ${formatIsoDate(a.endDate, locale)}`;
          return (
            <div
              key={a._id}
              className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2 text-sm"
            >
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{tAbs(a.type)}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {range}
                {a.halfDay ? " · ½" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function AdminControls({
  user,
  isAdmin,
  onClose,
}: {
  user: ProfileUser;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tRoles = useTranslations("Roles");
  const me = useCurrentUser();
  const confirm = useConfirm();
  const setRole = useMutation(api.users.setRole);
  const setStatus = useAction(api.users.setStatus);
  const removeMember = useAction(api.members.remove);
  const reinvite = useAction(api.members.reinvite);
  const setUploadPermission = useAction(api.users.setUploadPermission);
  const setGfAccess = useAction(api.users.setGfAccess);
  const handleError = useErrorHandler();

  const isSelf = user._id === me._id;
  const isActive = user.status === "active";
  // Admins can be demoted via the role picker, but not suspended or removed
  // outright — that would let one admin lock another out of their own
  // account. Backend rejects these too; this just keeps the UI from
  // offering an action that's guaranteed to fail.
  const isTargetAdmin = user.role === "admin";

  function changeRole(role: Role) {
    setRole({ userId: user._id, role })
      .then(() => toast.success(tRoles(role)))
      .catch(handleError);
  }

  async function toggleStatus() {
    if (isActive) {
      const ok = await confirm({
        title: t("suspend"),
        description: tc("deleteWarning"),
        confirmLabel: t("suspend"),
        cancelLabel: tc("cancel"),
      });
      if (!ok) return;
    }
    setStatus({
      userId: user._id,
      status: isActive ? "suspended" : "active",
    }).catch(handleError);
  }

  async function onRemove() {
    const ok = await confirm({
      title: t("removeTitle", { name: user.name }),
      description: t("removeBody"),
      confirmLabel: t("removeMember"),
      cancelLabel: tc("cancel"),
    });
    if (!ok) return;
    onClose();
    removeMember({ userId: user._id })
      .then(() => toast.success(t("removed")))
      .catch(handleError);
  }

  function onReinvite() {
    reinvite({ userId: user._id })
      .then(() => toast.success(t("reinviteSent")))
      .catch(handleError);
  }

  function toggleUploads() {
    setUploadPermission({
      userId: user._id,
      enabled: !user.uploadRequestsEnabled,
    })
      .then(() =>
        toast.success(
          user.uploadRequestsEnabled
            ? t("uploadsDisabled")
            : t("uploadsEnabled")
        )
      )
      .catch(handleError);
  }

  function toggleGf() {
    setGfAccess({ userId: user._id, gfAccess: !user.gfAccess })
      .then(() =>
        toast.success(user.gfAccess ? t("gfRevoked") : t("gfGranted"))
      )
      .catch(handleError);
  }

  return (
    <Section label={t("title")}>
      <div className="space-y-3 rounded-lg border border-border/70 p-3">
        {isAdmin && !isSelf && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("role")}</span>
            <RoleSelect value={user.role} onChange={changeRole} />
          </div>
        )}
        {isAdmin && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("teams")}</span>
            <TeamsEditor userId={user._id} teams={user.teams} />
          </div>
        )}
        {/* Permission grants and lifecycle actions only make sense on
            someone else's account — a member can't grant themselves access
            or reinvite/suspend/remove themselves. */}
        {!isSelf && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={toggleUploads}>
              <UploadCloud />
              {user.uploadRequestsEnabled
                ? t("disableUploads")
                : t("enableUploads")}
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={toggleGf}>
                <Lock />
                {user.gfAccess ? t("revokeGf") : t("grantGf")}
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => onReinvite()}>
                <Send /> {t("reinvite")}
              </Button>
            )}
            {isAdmin && !isTargetAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void toggleStatus()}
              >
                <ShieldCheck />
                {isActive ? t("suspend") : t("activate")}
              </Button>
            )}
            {isAdmin && !isTargetAdmin && (
              <Button
                variant="destructive"
                size="sm"
                className="col-span-2"
                onClick={() => void onRemove()}
              >
                <UserMinus /> {t("removeMember")}
              </Button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function ProfileContent({
  user,
  onClose,
}: {
  user: ProfileUser;
  onClose: () => void;
}) {
  const t = useTranslations("Profile");
  const tRoles = useTranslations("Roles");
  const tAdmin = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const router = useRouter();
  const me = useCurrentUser();
  const isAdmin = useIsAdmin();
  const isManager = useIsManager();
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const handleError = useErrorHandler();
  const now = useNow();

  const isSelf = user._id === me._id;

  async function message() {
    try {
      const { conversationId } = await getOrCreateDm({ otherUserId: user._id });
      router.push(`/chat?c=${conversationId}`);
      onClose();
    } catch (e) {
      handleError(e);
    }
  }

  function copyEmail() {
    void navigator.clipboard.writeText(user.email);
    toast.success(tAdmin("emailCopied"));
  }

  const hasContact = Boolean(user.email || user.phone || user.department);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border/70 p-5">
        <div className="relative shrink-0">
          <Avatar className="size-16">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback className="text-lg">
              {initials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          {user.lastActiveAt && now - user.lastActiveAt < ONLINE_WINDOW_MS && (
            <span
              title={t("online")}
              className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-background bg-success"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">
            {user.name}
          </p>
          {user.jobTitle && (
            <p className="truncate text-sm text-muted-foreground">
              {user.jobTitle}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge variant="muted">{tRoles(user.role)}</Badge>
            {user.status === "suspended" && (
              <Badge variant="destructive">{tAdmin("suspended")}</Badge>
            )}
            {user.external && (
              <Badge variant="warning">{tAdmin("external")}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {!isSelf && (
          <Button className="w-full" onClick={() => void message()}>
            <MessageSquare /> {t("message")}
          </Button>
        )}

        {hasContact && (
          <Section label={t("contact")}>
            <div className="space-y-1">
              <ContactRow
                icon={<Mail className="size-4" />}
                value={user.email}
                href={`mailto:${user.email}`}
                onCopy={copyEmail}
              />
              {user.phone && (
                <ContactRow
                  icon={<Phone className="size-4" />}
                  value={user.phone}
                  href={`tel:${user.phone.replace(/\s+/g, "")}`}
                />
              )}
              {user.department && (
                <ContactRow
                  icon={<Building2 className="size-4" />}
                  value={user.department}
                />
              )}
            </div>
          </Section>
        )}

        {user.teams.length > 0 && (
          <Section label={tAdmin("teams")}>
            <div className="flex flex-wrap gap-1">
              {user.teams.map(team => (
                <Badge key={team} variant="muted" className="gap-1.5">
                  <span
                    className={cn("size-1.5 rounded-full", teamColor(team))}
                  />
                  {tTeams(teamLabelKey(team))}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        <Organisation userId={user._id} />

        {!isSelf && (
          <MutualConversations userId={user._id} onNavigate={onClose} />
        )}

        <UpcomingAbsences userId={user._id} />

        {/* Managers only need this panel to act on someone else; on their
            own profile there's nothing manager-level left to show once
            self-targeting actions are hidden. */}
        {(isAdmin || (isManager && !isSelf)) && (
          <AdminControls user={user} isAdmin={isAdmin} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

export interface UserProfileProps {
  userId: Id<"users"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A reusable, Discord-style member profile. Everyone sees the standard card
 * (avatar, contact details, mutual chats, upcoming time off); admins also get
 * the management controls (role, teams, suspend, remove, re-invite). It renders
 * as a bottom drawer on mobile and a centred dialog on desktop, so the same
 * component can be opened from the directory, chat, the admin members list, and
 * anywhere else a person is shown.
 */
export function UserProfile({ userId, open, onOpenChange }: UserProfileProps) {
  const t = useTranslations("Profile");
  const isMobile = useIsMobile();
  const user = useUser(userId);

  const close = () => onOpenChange(false);
  const title = user?.name ?? t("title");

  const body = user ? (
    <ProfileContent user={user} onClose={close} />
  ) : (
    <div className="p-10 text-center text-sm text-muted-foreground">
      {user === null ? t("notFound") : ""}
    </div>
  );

  // Mobile: a vaul bottom-sheet that can be dragged to dismiss and animates
  // open/closed. Drag-to-dismiss, snap-back, Escape, backdrop click, and body
  // scroll lock are all handled by vaul internally.
  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background text-foreground shadow-2xl shadow-black/40 outline-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            {/* Visual drag handle — vaul makes the whole Content draggable */}
            <div className="flex shrink-0 cursor-grab items-center justify-center pb-1 pt-3 active:cursor-grabbing">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {body}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Desktop: keep the centred dialog.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
