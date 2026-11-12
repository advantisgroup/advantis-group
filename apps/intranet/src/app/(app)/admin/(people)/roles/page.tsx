"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderActions, PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { useIsManager } from "@/components/providers/current-user";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { CAPABILITY_GROUPS, CAPABILITY_ICONS, ROLE_ICONS } from "@/lib/permission-icons";

const TIERS = ["employee", "manager", "admin"] as const;

/** Just a name — everything else is set on the role's own page. */
function NewRoleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("CustomRoles");
  const router = useRouter();
  const createRole = useMutation(api.org.roles.create);
  const handleError = useErrorHandler();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const id = await createRole({ name: name.trim(), capabilities: [] });
      toast.success(t("created"));
      onOpenChange(false);
      setName("");
      router.push(`/admin/roles/${id}`);
    } catch (err) {
      handleError(err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("newRole")}</DialogTitle>
          <DialogDescription>{t("newRoleHint")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor="new-role-name" className="mb-2 block text-sm font-medium">
            {t("name")}
          </label>
          <Input
            id="new-role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            autoFocus
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button disabled={!name.trim() || creating} onClick={() => void create()}>
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRolesPage() {
  const t = useTranslations("CustomRoles");
  const ta = useTranslations("Admin");
  const tr = useTranslations("Roles");
  const isManager = useIsManager();
  const roles = useQuery(api.org.roles.list, isManager ? {} : "skip");
  const people = useQuery(api.people.users.options, isManager ? {} : "skip");
  const [creating, setCreating] = useState(false);

  const personById = useMemo(() => new Map((people ?? []).map((p) => [p.userId, p])), [people]);

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeaderBar
        title={ta("customRolesTab")}
        description={t("description")}
        icon={<ShieldCheck />}
      />
      <PageHeaderActions
        actions={[
          { key: "new-role", label: t("newRole"), icon: Plus, onClick: () => setCreating(true) },
        ]}
      />

      <SettingsSection title={t("rolesTitle")} description={t("rolesHint")}>
        {roles === undefined ? (
          <Skeleton className="h-32 rounded-none" />
        ) : roles.length === 0 ? (
          <EmptyState
            inline
            icon={<ShieldCheck />}
            title={t("empty")}
            description={t("emptyHint")}
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                {t("newRole")}
              </Button>
            }
          />
        ) : (
          [...roles]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((role) => {
              // One icon per area the role reaches into, so a row says
              // "where" at a glance without listing every permission.
              const areas = CAPABILITY_GROUPS.filter((group) =>
                group.capabilities.some((cap) => role.capabilities.includes(cap)),
              );
              return (
                <Link
                  key={role._id}
                  href={`/admin/roles/${role._id}`}
                  className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{role.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                      <span>{t("permissionCount", { count: role.capabilities.length })}</span>
                      <span aria-hidden>·</span>
                      <span>{t("memberCount", { count: role.memberIds.length })}</span>
                      {areas.length > 0 && (
                        <span className="flex items-center gap-1.5 pl-1" aria-hidden>
                          {areas.map((group) => {
                            const Icon = CAPABILITY_ICONS[group.capabilities[0]];
                            return <Icon key={group.key} className="size-3.5" />;
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                  <AvatarStack
                    className="hidden sm:flex"
                    max={5}
                    people={role.memberIds.flatMap((id) => {
                      const person = personById.get(id);
                      return person ? [{ id, name: person.name, avatar: person.avatarUrl }] : [];
                    })}
                  />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })
        )}
      </SettingsSection>

      <SettingsSection title={t("tiersTitle")} description={t("tiersHint")}>
        {TIERS.map((tier) => {
          const Icon = ROLE_ICONS[tier];
          return (
            <SettingsRow
              key={tier}
              title={
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  {tr(tier)}
                </span>
              }
              description={tr(`${tier}_desc`)}
            />
          );
        })}
      </SettingsSection>

      <NewRoleDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
