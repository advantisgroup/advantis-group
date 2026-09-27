"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation } from "convex/react";
import { Cake, CalendarDays, Mail, MessageSquare, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Drawer } from "vaul";

import { StatusMessage } from "@/components/profile/StatusMessage";
import { StatusMessageDialog } from "@/components/profile/StatusMessageDialog";
import { useCurrentUser, useIsAdmin, useIsManager } from "@/components/providers/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNow } from "@/lib/activity/useNow";
import { formatIsoDate, initials } from "@/lib/format";
import { profileColorStyle, profileGradientClass } from "@/lib/profile-gradient";
import { activeStatusMessage } from "@/lib/status-message";
import { teamColor, teamLabelKey } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { ManagementRail } from "./ProfileAdmin";
import { ContactRow, DetailRow, InfoPanel, RoleBadge, Section, useUser } from "./ProfileParts";
import {
  Expertise,
  HrRecord,
  MutualConversations,
  Organisation,
  type ProfileUser,
  UpcomingAbsences,
} from "./ProfileSections";

/** How recent a presence heartbeat still counts as "online". */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function ProfileContent({ user, onClose }: { user: ProfileUser; onClose: () => void }) {
  const t = useTranslations("Profile");
  const tRoles = useTranslations("Roles");
  const tAdmin = useTranslations("Admin");
  const tTeams = useTranslations("Teams");
  const locale = useLocale();
  const router = useRouter();
  const me = useCurrentUser();
  const isAdmin = useIsAdmin();
  const isManager = useIsManager();
  const getOrCreateDm = useMutation(api.chat.getOrCreateDm);
  const setRoleLabelMutation = useMutation(api.people.users.setRoleLabel);
  const handleError = useErrorHandler();
  const now = useNow();

  const isSelf = user._id === me._id;
  const [statusOpen, setStatusOpen] = useState(false);

  async function message() {
    try {
      const { conversationId } = await getOrCreateDm({ otherUserId: user._id });
      router.push(`/chat?c=${conversationId}`);
      onClose();
    } catch (e) {
      handleError(e);
    }
  }

  function copy(value: string, confirmation: string) {
    void navigator.clipboard.writeText(value);
    toast.success(confirmation);
  }

  function saveRoleLabel(value: string) {
    setRoleLabelMutation({
      userId: user._id,
      roleLabel: value.trim() || undefined,
    })
      .then(() => toast.success(tAdmin("roleLabelSaved")))
      .catch(handleError);
  }

  const canManage = !isSelf && isManager;
  const online = Boolean(user.lastActiveAt && now - user.lastActiveAt < ONLINE_WINDOW_MS);
  // Birthdays are opt-in; a manager viewing someone's profile doesn't override
  // the person's own "don't show this" choice.
  const showBirthday = Boolean(user.dateOfBirth && (user.showBirthdayPublicly || isSelf));
  const subtitle = [user.jobTitle, user.department].filter(Boolean).join(" · ");

  const identity = (
    <header>
      {/* The person's gradient/colour as a banner the avatar breaks out of,
          instead of a coloured slab with the name written on top of it — the
          identity copy reads on the card surface, at full contrast, whatever
          colour was picked. */}
      <div
        className={cn("h-24 sm:h-28", profileGradientClass(user.profileGradient))}
        style={profileColorStyle(user.profileColor)}
      />
      <div className="relative -mt-10 px-5">
        <div className="flex items-end justify-between gap-3">
          <div className="relative shrink-0">
            <Avatar className="size-20 ring-4 ring-card">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                {initials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            {online && (
              <span
                title={t("online")}
                className="absolute bottom-0.5 right-0.5 size-4 rounded-full border-[3px] border-card bg-success"
              />
            )}
          </div>
          {!isSelf && (
            <Button className="mb-1 shrink-0" onClick={() => void message()}>
              <MessageSquare /> {t("message")}
            </Button>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <h2 className="break-words font-display text-xl font-bold leading-tight tracking-tight text-balance">
            {user.name}
          </h2>
          {subtitle && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subtitle}</p>
          )}
          <StatusMessage status={user.statusMessage} className="mt-2" />
          {isSelf && (
            <button
              type="button"
              onClick={() => setStatusOpen(true)}
              className="mt-1.5 text-xs font-medium text-primary hover:underline"
            >
              {activeStatusMessage(user.statusMessage) ? t("statusChange") : t("statusSet")}
            </button>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <RoleBadge member={user} isAdmin={isAdmin} tRoles={tRoles} onSave={saveRoleLabel} />
            {user.status === "suspended" && (
              <Badge variant="destructive">{tAdmin("suspended")}</Badge>
            )}
            {user.external && <Badge variant="warning">{tAdmin("external")}</Badge>}
            {user.managingDirector && <Badge variant="muted">{t("managingDirector")}</Badge>}
          </div>
          <Expertise tags={user.expertise} isSelf={isSelf} />
        </div>
      </div>
    </header>
  );

  const details = (
    <InfoPanel>
      {/* Department already sits under the name, so it isn't repeated here. */}
      <Section label={t("contact")}>
        <div className="space-y-1">
          <ContactRow
            icon={<Mail />}
            value={user.email}
            href={`mailto:${user.email}`}
            onCopy={() => copy(user.email, tAdmin("emailCopied"))}
          />
          {user.phone && (
            <ContactRow
              icon={<Phone />}
              value={user.phone}
              href={`tel:${user.phone.replace(/\s+/g, "")}`}
              onCopy={() => copy(user.phone ?? "", t("phoneCopied"))}
            />
          )}
        </div>
      </Section>

      {(user.hireDate || showBirthday) && (
        <Section label={t("details")}>
          <div className="space-y-1">
            {user.hireDate && (
              <DetailRow
                icon={<CalendarDays />}
                label={t("memberSince")}
                value={formatIsoDate(user.hireDate, locale)}
              />
            )}
            {showBirthday && user.dateOfBirth && (
              <DetailRow
                icon={<Cake />}
                label={t("birthday")}
                value={formatIsoDate(user.dateOfBirth, locale)}
              />
            )}
          </div>
        </Section>
      )}

      {user.teams.length > 0 && (
        <Section label={tAdmin("teams")}>
          <div className="flex flex-wrap gap-1.5">
            {user.teams.map((team) => (
              <Badge key={team} variant="muted" className="gap-1.5">
                <span className={cn("size-1.5 rounded-full", teamColor(team))} />
                {tTeams(teamLabelKey(team))}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      <Organisation userId={user._id} />
      <HrRecord userId={user._id} onNavigate={onClose} />
      <UpcomingAbsences userId={user._id} />
      {!isSelf && <MutualConversations userId={user._id} onNavigate={onClose} />}
    </InfoPanel>
  );

  const card = (
    <section className="min-w-0 pb-5">
      {identity}
      <div className="px-5 pt-5">{details}</div>
      {isSelf && <StatusMessageDialog open={statusOpen} onOpenChange={setStatusOpen} />}
    </section>
  );

  // `min-h-0 flex-1` rather than `h-full`: the dialog and the sheet only cap
  // their height, so a percentage height never resolves and a long profile
  // got clipped instead of scrolling.
  if (!canManage) {
    return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{card}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:flex-row lg:overflow-hidden">
      <div className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{card}</div>
      {/* 25rem, not less: the role picker's three German labels are the widest
          thing in the rail and this is what fits them on one line. */}
      <aside className="shrink-0 border-t border-border/70 bg-panel-2/30 lg:flex lg:min-h-0 lg:w-[25rem] lg:flex-col lg:border-l lg:border-t-0">
        <ManagementRail user={user} isAdmin={isAdmin} onClose={onClose} />
      </aside>
    </div>
  );
}

/** Stands in for the identity header while the profile loads, so the dialog
 *  never opens as an empty box. */
function ProfileSkeleton() {
  return (
    <div aria-hidden className="pb-5">
      <Skeleton className="h-24 rounded-none sm:h-28" />
      <div className="-mt-10 px-5">
        <Skeleton className="size-20 rounded-full ring-4 ring-card" />
        <Skeleton className="mt-3 h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <div className="px-5 pt-5">
        <Skeleton className="h-36 w-full rounded-xl" />
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
  const me = useCurrentUser();
  const isManager = useIsManager();
  const user = useUser(userId);

  const close = () => onOpenChange(false);
  const title = user?.name ?? t("title");
  const canManage = !!user && user._id !== me._id && isManager;

  const body = user ? (
    <ProfileContent user={user} onClose={close} />
  ) : user === null ? (
    <p className="px-6 pb-10 pt-12 text-center text-sm text-muted-foreground">{t("notFound")}</p>
  ) : (
    <ProfileSkeleton />
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
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card text-card-foreground shadow-2xl shadow-black/40 outline-none"
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            {/* Over the banner rather than above it, so the colour runs all the
                way to the sheet's rounded top edge. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2.5">
              <span className="h-1.5 w-10 rounded-full bg-white/70 ring-1 ring-black/10" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
              {body}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0",
          // The dialog's own close button lands on the colour banner at every
          // width except the two-column one, where it lands on the management
          // rail instead — a translucent chip reads on both.
          "[&_[data-slot=dialog-close]]:bg-black/25 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:backdrop-blur-sm [&_[data-slot=dialog-close]]:hover:bg-black/45",
          canManage ? "h-[85dvh] max-h-[44rem] max-w-4xl" : "max-w-md",
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
