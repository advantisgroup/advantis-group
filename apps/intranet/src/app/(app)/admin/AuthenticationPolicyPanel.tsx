"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Switch } from "@/components/notifications/NotificationPreferences";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SettingsLayoutProvider,
  SettingsRow,
  SettingsSection,
} from "@/components/ui/settings-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { initials } from "@/lib/format";

type Scope = "off" | "managers_and_up" | "all";

interface PolicyForm {
  requireMfaScope: Scope;
  requireMfaRetroactive: boolean;
  requireMfaForDestructive: boolean;
  destructiveActionTtlMinutes: number;
  minDestructiveLevel: number;
  requirePasskeyScope: Scope;
  requirePasskeyRetroactive: boolean;
  gracePeriodDays: number;
  exemptUserIds: Id<"users">[];
  areaReverifyDays: number;
}

function ScopeSection({
  title,
  hint,
  scope,
  retroactive,
  onScopeChange,
  onRetroactiveChange,
}: {
  title: string;
  hint: string;
  scope: Scope;
  retroactive: boolean;
  onScopeChange: (scope: Scope) => void;
  onRetroactiveChange: (value: boolean) => void;
}) {
  const t = useTranslations("Admin");
  return (
    <SettingsSection title={title} description={hint}>
      <RadioGroup
        value={scope}
        onValueChange={(v) => onScopeChange(v as Scope)}
        className="gap-0 divide-y divide-border/60"
      >
        {(["off", "managers_and_up", "all"] as const).map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-3 px-4 py-3 text-[13.5px] transition-colors hover:bg-muted/40 has-[[data-state=checked]]:font-medium"
          >
            <RadioGroupItem value={value} />
            {t(`authenticationScope_${value}`)}
          </label>
        ))}
      </RadioGroup>
      {scope !== "off" && (
        <SettingsRow
          title={t("authenticationRetroactive")}
          description={t("authenticationRetroactiveHint")}
          control={
            <Switch
              checked={retroactive}
              onToggle={() => onRetroactiveChange(!retroactive)}
              label={t("authenticationRetroactive")}
            />
          }
        />
      )}
    </SettingsSection>
  );
}

function ExemptUsersPicker({
  selected,
  onChange,
}: {
  selected: Id<"users">[];
  onChange: (ids: Id<"users">[]) => void;
}) {
  const t = useTranslations("Admin");
  const [search, setSearch] = useState("");
  const results = useQuery(api.users.list, { search, includeSuspended: false });
  const [nameCache, setNameCache] = useState<Map<string, { name: string; avatar?: string }>>(
    new Map(),
  );

  useEffect(() => {
    if (!results) return;
    setNameCache((prev) => {
      const next = new Map(prev);
      for (const user of results) {
        next.set(user._id, { name: user.name, avatar: user.avatar ?? undefined });
      }
      return next;
    });
  }, [results]);

  function toggle(id: Id<"users">) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="mt-3 space-y-2.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const info = nameCache.get(id);
            return (
              <Badge key={id} variant="outline" className="gap-1 pr-1">
                {info?.name ?? id}
                <button
                  type="button"
                  aria-label={t("authenticationExemptRemove")}
                  onClick={() => toggle(id)}
                  className="rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("authenticationExemptSearchPlaceholder")}
          className="pl-8"
        />
      </div>
      {search.trim() && (
        <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border/70 p-1 sm:max-w-sm">
          {results?.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("authenticationExemptEmpty")}
            </p>
          ) : (
            results?.map((user) => (
              <label
                key={user._id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={selected.includes(user._id)}
                  onCheckedChange={() => toggle(user._id)}
                />
                <Avatar className="size-6">
                  {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                  <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate text-sm">{user.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AdoptionKpi({
  label,
  pct,
  count,
  total,
}: {
  label: string;
  pct: number;
  count: number;
  total: number;
}) {
  const percent = Math.min(100, Math.round(pct * 100));
  return (
    <Kpi label={label} value={`${percent}%`} hint={`${count} / ${total}`}>
      <span className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </span>
    </Kpi>
  );
}

/** The compliance answer this whole feature was partly built to replace "go
 * look in the Convex dashboard" with — exact counts, and exactly who's
 * currently out of step with the policy below. Read-only; changing anything
 * here happens through the sections under it. */
function SecurityStandardSection() {
  const t = useTranslations("Admin");
  const tRoles = useTranslations("Roles");
  const standard = useQuery(api.stepUp.orgStandard);

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold tracking-tight">{t("authenticationStandardTitle")}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {t("authenticationStandardHint")}
        </p>
      </header>

      {!standard ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : (
        <>
          <KpiStrip className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3">
            <AdoptionKpi
              label={t("authenticationStandardMfaAdoption")}
              pct={standard.mfaEnrolledPct}
              count={standard.mfaEnrolledCount}
              total={standard.totalActive}
            />
            <AdoptionKpi
              label={t("authenticationStandardPasskeyAdoption")}
              pct={standard.passkeyEnrolledPct}
              count={standard.passkeyEnrolledCount}
              total={standard.totalActive}
            />
            <Kpi
              label={t("authenticationStandardBelow")}
              value={standard.nonCompliant.length}
              tone={standard.nonCompliant.length > 0 ? "warn" : "neutral"}
            />
          </KpiStrip>

          {standard.nonCompliant.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("authenticationStandardClean")}</p>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
              {standard.nonCompliant.map((entry) => (
                <li
                  key={entry.userId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3"
                >
                  <span className="min-w-0 text-[13.5px] font-medium">{entry.name}</span>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[11px]">
                      {tRoles(entry.role as "admin" | "manager" | "employee")}
                    </Badge>
                    {entry.missing.map((missing) => (
                      <Badge key={missing} variant="warning" className="text-[11px]">
                        {missing === "mfa"
                          ? t("authenticationStandardMissingMfa")
                          : t("authenticationStandardMissingPasskey")}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const AREA_LABEL_KEY = {
  performance: "authenticationAreaPerformance",
  applicant_vault: "authenticationAreaApplicantVault",
} as const;

/** Phase 7 of docs/future-features/21_auth-consolidation.md's admin-visible
 * companion to `SecurityStandardSection` above — the device-trust opt-in/
 * opt-out split and each area's "always step up" vs. "trust device"
 * preference split, so the 14-day window set below isn't the only thing
 * visible here. Read-only, same as the section above it. */
function AreaReverifyStandardSection() {
  const t = useTranslations("Admin");
  const standard = useQuery(api.stepUp.areaStandard);

  if (!standard) return <Skeleton className="h-28 rounded-xl" />;

  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold tracking-tight">
          {t("authenticationAreaStandardTitle")}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {t("authenticationAreaStandardHint")}
        </p>
      </header>
      <KpiStrip className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3">
        <Kpi
          label={t("authenticationDeviceTrackingOptIn")}
          value={standard.deviceTrackingOptInCount}
        />
        <Kpi
          label={t("authenticationDeviceTrackingOptOut")}
          value={standard.deviceTrackingOptOutCount}
        />
        {standard.byArea.map((entry) => (
          <Kpi
            key={entry.area}
            label={t("authenticationAlwaysStepUpFor", { area: t(AREA_LABEL_KEY[entry.area]) })}
            value={entry.alwaysStepUpCount}
            hint={`${t("authenticationTrustDeviceCount")}: ${entry.trustDeviceCount}`}
          />
        ))}
      </KpiStrip>
    </section>
  );
}

function formOf(policy: PolicyForm): PolicyForm {
  return {
    requireMfaScope: policy.requireMfaScope,
    requireMfaRetroactive: policy.requireMfaRetroactive,
    requireMfaForDestructive: policy.requireMfaForDestructive,
    destructiveActionTtlMinutes: policy.destructiveActionTtlMinutes,
    minDestructiveLevel: policy.minDestructiveLevel,
    requirePasskeyScope: policy.requirePasskeyScope,
    requirePasskeyRetroactive: policy.requirePasskeyRetroactive,
    gracePeriodDays: policy.gracePeriodDays,
    exemptUserIds: policy.exemptUserIds,
    areaReverifyDays: policy.areaReverifyDays,
  };
}

function appliesRetroactively(scope: Scope, retroactive: boolean) {
  return scope !== "off" && retroactive;
}

/**
 * Every change commits the moment it's made, like the rest of settings —
 * there's no draft to lose and no save bar to chase. The one kind of change
 * that interrupts people who already have access asks first.
 */
export function AuthenticationPolicyPanel() {
  const t = useTranslations("Admin");
  const policy = useQuery(api.stepUp.orgPolicy);
  const setPolicy = useMutation(api.stepUp.setOrgPolicy);
  const handleError = useErrorHandler();
  const confirm = useConfirm();
  const [form, setForm] = useState<PolicyForm | null>(null);
  // Saves run one after another so a slow earlier save can't land on top of a newer one.
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (policy && !form) setForm(formOf(policy));
  }, [policy, form]);

  if (!form || !policy) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  function persist(next: PolicyForm) {
    queue.current = queue.current
      .then(() => setPolicy(next))
      .then(
        () => {
          toast.success(t("authenticationSaved"));
        },
        (error) => {
          handleError(error);
          if (policy) setForm(formOf(policy));
        },
      );
  }

  async function change(patch: Partial<PolicyForm>) {
    if (!form || !policy) return;
    const next = { ...form, ...patch };
    const items: { tone: "neutral"; text: string }[] = [];
    if (
      appliesRetroactively(next.requireMfaScope, next.requireMfaRetroactive) &&
      !appliesRetroactively(policy.requireMfaScope, policy.requireMfaRetroactive)
    ) {
      items.push({ tone: "neutral", text: t("authenticationConfirmMfaRetroactive") });
    }
    if (
      appliesRetroactively(next.requirePasskeyScope, next.requirePasskeyRetroactive) &&
      !appliesRetroactively(policy.requirePasskeyScope, policy.requirePasskeyRetroactive)
    ) {
      items.push({ tone: "neutral", text: t("authenticationConfirmPasskeyRetroactive") });
    }
    if (items.length > 0) {
      const ok = await confirm({
        title: t("authenticationConfirmTitle"),
        description: t("authenticationConfirmBody"),
        items,
        confirmLabel: t("authenticationApply"),
        cancelLabel: t("authenticationCancel"),
      });
      if (!ok) return;
    }
    setForm(next);
    persist(next);
  }

  // Number fields save when you leave them, not on every keystroke.
  function commitNumbers() {
    if (!form || !policy) return;
    if (
      form.gracePeriodDays !== policy.gracePeriodDays ||
      form.destructiveActionTtlMinutes !== policy.destructiveActionTtlMinutes ||
      form.areaReverifyDays !== policy.areaReverifyDays
    ) {
      persist(form);
    }
  }

  return (
    <SettingsLayoutProvider value="stacked">
      <div className="space-y-10">
        <SecurityStandardSection />
        <AreaReverifyStandardSection />

        <ScopeSection
          title={t("authenticationMfaTitle")}
          hint={t("authenticationMfaHint")}
          scope={form.requireMfaScope}
          retroactive={form.requireMfaRetroactive}
          onScopeChange={(requireMfaScope) => void change({ requireMfaScope })}
          onRetroactiveChange={(requireMfaRetroactive) => void change({ requireMfaRetroactive })}
        />

        <ScopeSection
          title={t("authenticationPasskeyTitle")}
          hint={t("authenticationPasskeyHint")}
          scope={form.requirePasskeyScope}
          retroactive={form.requirePasskeyRetroactive}
          onScopeChange={(requirePasskeyScope) => void change({ requirePasskeyScope })}
          onRetroactiveChange={(requirePasskeyRetroactive) =>
            void change({ requirePasskeyRetroactive })
          }
        />

        <SettingsSection
          title={t("authenticationDestructiveTitle")}
          description={t("authenticationDestructiveHint")}
        >
          <SettingsRow
            title={t("authenticationDestructiveEnable")}
            control={
              <Switch
                checked={form.requireMfaForDestructive}
                onToggle={() =>
                  void change({ requireMfaForDestructive: !form.requireMfaForDestructive })
                }
                label={t("authenticationDestructiveEnable")}
              />
            }
          />
          {form.requireMfaForDestructive && (
            <>
              <SettingsRow
                title={t("authenticationDestructiveLevel")}
                control={
                  <Select
                    value={String(form.minDestructiveLevel)}
                    onValueChange={(v) => void change({ minDestructiveLevel: Number(v) })}
                  >
                    <SelectTrigger className="w-64 max-w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t("authenticationLevel1")}</SelectItem>
                      <SelectItem value="2">{t("authenticationLevel2")}</SelectItem>
                      <SelectItem value="3">{t("authenticationLevel3")}</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
              <SettingsRow
                title={t("authenticationDestructiveTtl")}
                control={
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    className="w-24 tabular-nums"
                    value={form.destructiveActionTtlMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        destructiveActionTtlMinutes: Math.min(
                          120,
                          Math.max(1, Number(e.target.value) || 1),
                        ),
                      })
                    }
                    onBlur={commitNumbers}
                  />
                }
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t("authenticationEnforcementTitle")}>
          <SettingsRow
            title={t("authenticationGracePeriod")}
            description={t("authenticationGracePeriodHint")}
            control={
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                className="w-24 tabular-nums"
                value={form.gracePeriodDays}
                onChange={(e) =>
                  setForm({
                    ...form,
                    gracePeriodDays: Math.min(90, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                onBlur={commitNumbers}
              />
            }
          />
          <SettingsRow
            title={t("authenticationExempt")}
            description={t("authenticationExemptHint")}
          >
            <ExemptUsersPicker
              selected={form.exemptUserIds}
              onChange={(exemptUserIds) => void change({ exemptUserIds })}
            />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title={t("authenticationAreaReverifyTitle")}
          description={t("authenticationAreaReverifyHint")}
        >
          <SettingsRow
            title={t("authenticationAreaReverifyDays")}
            control={
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                className="w-24 tabular-nums"
                value={form.areaReverifyDays}
                onChange={(e) =>
                  setForm({
                    ...form,
                    areaReverifyDays: Math.min(90, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                onBlur={commitNumbers}
              />
            }
          />
        </SettingsSection>
      </div>
    </SettingsLayoutProvider>
  );
}
