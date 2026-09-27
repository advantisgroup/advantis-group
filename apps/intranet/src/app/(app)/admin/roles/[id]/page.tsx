"use client";

import { use, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ArrowLeft, Search, ShieldCheck, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link } from "@/components/Link";
import { ForbiddenScreen } from "@/components/layout/ForbiddenScreen";
import { PageHeaderBar } from "@/components/layout/PageHeaderBar";
import { PersonChip, PersonPicker } from "@/components/people/PersonPicker";
import { type Capability, useIsManager } from "@/components/providers/current-user";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/info-tip";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { CAPABILITY_GROUPS, CAPABILITY_ICONS, CAPABILITY_IMPLIES } from "@/lib/permission-icons";
import { cn } from "@/lib/utils";

type Role = NonNullable<FunctionReturnType<typeof api.org.roles.get>>;

/** What turning on `use_ai` actually opens up for this role — AI only ever
 * works inside areas the role reaches already. */
function AiScope({ capabilities }: { capabilities: Capability[] }) {
  const t = useTranslations("CustomRoles");
  const settings = useQuery(api.aiRuns.settings);

  return (
    <div className="space-y-2 border-t border-border/60 bg-muted/30 px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Sparkles className="size-3.5" />
        {t("aiScopeTitle")}
      </p>
      <p className="text-pretty">{t("aiScopeRead")}</p>
      <p className="text-pretty">{t("aiScopeWrite")}</p>
      {capabilities.includes("manage_guidebooks") && (
        <p className="text-pretty">{t("aiScopeGuidebooks")}</p>
      )}
      {settings && (
        <p>
          {t("aiLimit", { limit: settings.dailyRunLimit })}{" "}
          <Link href="/admin/ai" className="font-medium text-foreground hover:underline">
            {t("aiLimitLink")}
          </Link>
        </p>
      )}
    </div>
  );
}

function Permissions({ role }: { role: Role }) {
  const t = useTranslations("CustomRoles");
  const handleError = useErrorHandler();
  const [query, setQuery] = useState("");
  const update = useMutation(api.org.roles.update).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.org.roles.get, { customRoleId: role._id });
    if (current && args.capabilities) {
      store.setQuery(
        api.org.roles.get,
        { customRoleId: role._id },
        { ...current, capabilities: args.capabilities },
      );
    }
  });

  const impliedBy = (cap: Capability) =>
    role.capabilities.find((c) => CAPABILITY_IMPLIES[c]?.includes(cap));

  function toggle(cap: Capability, on: boolean) {
    const next = new Set(role.capabilities);
    if (on) {
      next.add(cap);
      for (const implied of CAPABILITY_IMPLIES[cap] ?? []) next.add(implied);
    } else {
      next.delete(cap);
    }
    update({ customRoleId: role._id, capabilities: [...next] }).catch(handleError);
  }

  const needle = query.trim().toLowerCase();
  const groups = CAPABILITY_GROUPS.map((group) => ({
    ...group,
    visible: group.capabilities.filter(
      (cap) =>
        !needle ||
        t(`capability_${cap}`).toLowerCase().includes(needle) ||
        t(`capability_${cap}_desc`).toLowerCase().includes(needle) ||
        t(`group_${group.key}`).toLowerCase().includes(needle),
    ),
  })).filter((group) => group.visible.length > 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{t("permissionsTitle")}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t("permissionsHint")}</p>
        </div>
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("capabilitySearchPlaceholder")}
            aria-label={t("capabilitySearchPlaceholder")}
            className="h-9 pl-8"
          />
        </div>
      </div>

      {groups.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t("capabilitySearchEmpty")}
        </p>
      )}

      {groups.map((group) => {
        const on = group.capabilities.filter((cap) => role.capabilities.includes(cap)).length;
        return (
          <div key={group.key} className="space-y-2">
            <p className="flex items-baseline justify-between px-1 text-xs font-medium text-muted-foreground">
              <span className="uppercase tracking-wider">{t(`group_${group.key}`)}</span>
              <span className={cn("tabular-nums", on > 0 && "text-foreground")}>
                {t("groupCount", { on, total: group.capabilities.length })}
              </span>
            </p>
            <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
              {group.visible.map((cap) => {
                const Icon = CAPABILITY_ICONS[cap];
                const checked = role.capabilities.includes(cap);
                const lockedBy = impliedBy(cap);
                const label = t(`capability_${cap}`);
                return (
                  <div key={cap}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          checked ? "text-foreground" : "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
                          <span className="truncate">{label}</span>
                          <InfoTip text={t(`capability_${cap}_desc`)} className="shrink-0" />
                        </p>
                        {lockedBy && (
                          <p className="text-[12px] text-muted-foreground">
                            {t("impliedBy", { by: t(`capability_${lockedBy}`) })}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={checked}
                        disabled={!!lockedBy}
                        onCheckedChange={(next) => toggle(cap, next)}
                        aria-label={label}
                      />
                    </div>
                    {cap === "use_ai" && checked && <AiScope capabilities={role.capabilities} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Members({ role }: { role: Role }) {
  const t = useTranslations("CustomRoles");
  const handleError = useErrorHandler();
  const people = useQuery(api.people.users.options);
  const addMember = useMutation(api.org.roles.addMember);
  const removeMember = useMutation(api.org.roles.removeMember);

  const personById = useMemo(() => new Map((people ?? []).map((p) => [p.userId, p])), [people]);
  const members = role.members.flatMap((m) => {
    const person = personById.get(m.userId);
    return person ? [{ ...m, person }] : [];
  });

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {t("membersTitle")}
            <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
              {role.members.length}
            </span>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t("membersHint")}</p>
        </div>
        <PersonPicker
          value={null}
          label={t("addMember")}
          exclude={role.members.map((m) => m.userId)}
          onChange={(userId) => {
            if (userId) addMember({ customRoleId: role._id, userId }).catch(handleError);
          }}
          align="end"
          trigger={
            <Button size="sm" variant="outline" className="shrink-0">
              <UserPlus className="size-4" />
              {t("addMember")}
            </Button>
          }
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {people === undefined ? (
          <Skeleton className="h-24 rounded-none" />
        ) : members.length === 0 ? (
          <EmptyState inline title={t("membersEmpty")} />
        ) : (
          <ul className="divide-y divide-border/60">
            {members.map(({ userId, role: tier, person }) => (
              <li key={userId} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <PersonChip person={person} />
                  {tier !== "employee" && (
                    <p className="mt-1 pl-[42px] text-[11.5px] text-muted-foreground">
                      {t(tier === "admin" ? "adminHasAll" : "managerHasAll")}
                    </p>
                  )}
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("removeMember", { name: person.name })}
                  className="shrink-0 text-muted-foreground"
                  onClick={() =>
                    removeMember({ customRoleId: role._id, userId }).catch(handleError)
                  }
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Saves when the field is left or Enter is pressed. */
function RoleName({ role }: { role: Role }) {
  const t = useTranslations("CustomRoles");
  const handleError = useErrorHandler();
  const update = useMutation(api.org.roles.update);
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = draft?.trim();
    setDraft(null);
    if (!next || next === role.name) return;
    update({ customRoleId: role._id, name: next })
      .then(() => toast.success(t("nameSaved")))
      .catch(handleError);
  }

  return (
    <Input
      value={draft ?? role.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      aria-label={t("name")}
      className="h-auto border-transparent bg-transparent px-2 py-1 font-display text-2xl font-semibold tracking-tight shadow-none hover:border-border focus-visible:border-border md:text-2xl"
    />
  );
}

function DangerZone({ role }: { role: Role }) {
  const t = useTranslations("CustomRoles");
  const router = useRouter();
  const confirm = useConfirm();
  const handleError = useErrorHandler();
  const removeRole = useMutation(api.org.roles.remove);

  async function remove() {
    const ok = await confirm({
      title: t("delete"),
      description: t("deleteConfirm", { name: role.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    try {
      await removeRole({ customRoleId: role._id });
      toast.success(t("deleted"));
      router.push("/admin/roles");
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-danger/30 px-4 py-3.5">
      <div className="min-w-0 max-w-md">
        <h2 className="text-sm font-semibold tracking-tight">{t("dangerTitle")}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{t("dangerHint")}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="text-danger hover:bg-danger/10 hover:text-danger"
        onClick={() => void remove()}
      >
        <Trash2 className="size-4" />
        {t("delete")}
      </Button>
    </section>
  );
}

export default function AdminRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("CustomRoles");
  const ta = useTranslations("Admin");
  const isManager = useIsManager();
  const role = useQuery(api.org.roles.get, isManager ? { customRoleId: id } : "skip");

  if (!isManager) return <ForbiddenScreen />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeaderBar title={ta("customRolesTab")} icon={<ShieldCheck />} priority={1} />
      <Link
        href="/admin/roles"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("backToRoles")}
      </Link>

      {role === undefined ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : role === null ? (
        <EmptyState icon={<ShieldCheck />} title={t("notFound")} />
      ) : (
        <>
          <div className="-ml-2">
            <RoleName key={role._id} role={role} />
          </div>
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-10">
              <Permissions role={role} />
              <DangerZone role={role} />
            </div>
            <div className="lg:sticky lg:top-20">
              <Members role={role} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
