"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { KeyRound, ScanFace, Search, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <div className="space-y-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <RadioGroup
        value={scope}
        onValueChange={(v) => onScopeChange(v as Scope)}
        className="gap-2.5"
      >
        {(["off", "managers_and_up", "all"] as const).map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem value={value} className="mt-0.5" />
            <span className="text-sm">{t(`authenticationScope_${value}`)}</span>
          </label>
        ))}
      </RadioGroup>
      {scope !== "off" && (
        <label className="flex cursor-pointer items-start gap-2.5 pl-1 text-sm">
          <Checkbox
            checked={retroactive}
            onCheckedChange={(v) => onRetroactiveChange(v === true)}
            className="mt-0.5"
          />
          <span>
            <span className="block">{t("authenticationRetroactive")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("authenticationRetroactiveHint")}
            </span>
          </span>
        </label>
      )}
    </div>
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
    <div className="space-y-2">
      <div>
        <p className="font-medium">{t("authenticationExempt")}</p>
        <p className="text-sm text-muted-foreground">{t("authenticationExemptHint")}</p>
      </div>

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

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("authenticationExemptSearchPlaceholder")}
          className="h-9 pl-8"
        />
      </div>
      {search.trim() && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1.5">
          {results?.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("authenticationExemptEmpty")}
            </p>
          ) : (
            results?.map((user) => (
              <label
                key={user._id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md p-1.5 hover:bg-muted"
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

function AdoptionBar({
  label,
  pct,
  count,
  total,
  icon: Icon,
}: {
  label: string;
  pct: number;
  count: number;
  total: number;
  icon: typeof KeyRound;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
        </span>
        <span className="text-muted-foreground">
          {count}/{total} · {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
        />
      </div>
    </div>
  );
}

/** The compliance answer this whole feature was partly built to replace "go
 * look in the Convex dashboard" with — exact counts, and exactly who's
 * currently out of step with the policy above. Read-only; changing anything
 * here happens through the sections above it. */
function SecurityStandardSection() {
  const t = useTranslations("Admin");
  const tRoles = useTranslations("Roles");
  const standard = useQuery(api.stepUp.orgStandard);

  if (!standard) {
    return (
      <Card>
        <CardContent className="flex justify-center p-5 text-muted-foreground">
          <ShieldAlert className="size-5 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <p className="font-medium">{t("authenticationStandardTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("authenticationStandardHint")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AdoptionBar
            label={t("authenticationStandardMfaAdoption")}
            pct={standard.mfaEnrolledPct}
            count={standard.mfaEnrolledCount}
            total={standard.totalActive}
            icon={ScanFace}
          />
          <AdoptionBar
            label={t("authenticationStandardPasskeyAdoption")}
            pct={standard.passkeyEnrolledPct}
            count={standard.passkeyEnrolledCount}
            total={standard.totalActive}
            icon={KeyRound}
          />
        </div>

        <div className="space-y-2 border-t border-border/70 pt-4">
          <p className="text-sm font-medium">
            {t("authenticationStandardNonCompliant", { count: standard.nonCompliant.length })}
          </p>
          {standard.nonCompliant.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("authenticationStandardClean")}</p>
          ) : (
            <div className="space-y-1.5">
              {standard.nonCompliant.map((entry) => (
                <div
                  key={entry.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{entry.name}</span>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {tRoles(entry.role as "admin" | "manager" | "employee")}
                    </Badge>
                    {entry.missing.map((missing) => (
                      <Badge key={missing} variant="warning" className="text-[10px]">
                        {missing === "mfa"
                          ? t("authenticationStandardMissingMfa")
                          : t("authenticationStandardMissingPasskey")}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AuthenticationPolicyPanel() {
  const t = useTranslations("Admin");
  const policy = useQuery(api.stepUp.orgPolicy);
  const setPolicy = useMutation(api.stepUp.setOrgPolicy);
  const handleError = useErrorHandler();
  const confirm = useConfirm();

  const [form, setForm] = useState<PolicyForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (policy && !form) {
      setForm({
        requireMfaScope: policy.requireMfaScope,
        requireMfaRetroactive: policy.requireMfaRetroactive,
        requireMfaForDestructive: policy.requireMfaForDestructive,
        destructiveActionTtlMinutes: policy.destructiveActionTtlMinutes,
        minDestructiveLevel: policy.minDestructiveLevel,
        requirePasskeyScope: policy.requirePasskeyScope,
        requirePasskeyRetroactive: policy.requirePasskeyRetroactive,
        gracePeriodDays: policy.gracePeriodDays,
        exemptUserIds: policy.exemptUserIds,
      });
    }
  }, [policy, form]);

  if (!form) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <ShieldAlert className="size-5 animate-pulse" />
      </div>
    );
  }

  const dirty =
    !!policy &&
    (form.requireMfaScope !== policy.requireMfaScope ||
      form.requireMfaRetroactive !== policy.requireMfaRetroactive ||
      form.requireMfaForDestructive !== policy.requireMfaForDestructive ||
      form.destructiveActionTtlMinutes !== policy.destructiveActionTtlMinutes ||
      form.minDestructiveLevel !== policy.minDestructiveLevel ||
      form.requirePasskeyScope !== policy.requirePasskeyScope ||
      form.requirePasskeyRetroactive !== policy.requirePasskeyRetroactive ||
      form.gracePeriodDays !== policy.gracePeriodDays ||
      form.exemptUserIds.length !== policy.exemptUserIds.length ||
      form.exemptUserIds.some((id) => !policy.exemptUserIds.includes(id)));

  const turningOnRetroactive =
    (form.requireMfaRetroactive && !policy?.requireMfaRetroactive) ||
    (form.requirePasskeyRetroactive && !policy?.requirePasskeyRetroactive);

  async function save() {
    if (!form) return;
    if (turningOnRetroactive) {
      const items: { tone: "neutral"; text: string }[] = [];
      if (form.requireMfaRetroactive && !policy?.requireMfaRetroactive) {
        items.push({ tone: "neutral", text: t("authenticationConfirmMfaRetroactive") });
      }
      if (form.requirePasskeyRetroactive && !policy?.requirePasskeyRetroactive) {
        items.push({ tone: "neutral", text: t("authenticationConfirmPasskeyRetroactive") });
      }
      const ok = await confirm({
        title: t("authenticationConfirmTitle"),
        description: t("authenticationConfirmBody"),
        items,
        confirmLabel: t("authenticationSave"),
        cancelLabel: t("authenticationCancel"),
      });
      if (!ok) return;
    }
    setSaving(true);
    setPolicy(form)
      .then(() => toast.success(t("authenticationSaved")))
      .catch(handleError)
      .finally(() => setSaving(false));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-6 p-5">
          <ScopeSection
            title={t("authenticationMfaTitle")}
            hint={t("authenticationMfaHint")}
            scope={form.requireMfaScope}
            retroactive={form.requireMfaRetroactive}
            onScopeChange={(requireMfaScope) => setForm({ ...form, requireMfaScope })}
            onRetroactiveChange={(requireMfaRetroactive) =>
              setForm({ ...form, requireMfaRetroactive })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 p-5">
          <ScopeSection
            title={t("authenticationPasskeyTitle")}
            hint={t("authenticationPasskeyHint")}
            scope={form.requirePasskeyScope}
            retroactive={form.requirePasskeyRetroactive}
            onScopeChange={(requirePasskeyScope) => setForm({ ...form, requirePasskeyScope })}
            onRetroactiveChange={(requirePasskeyRetroactive) =>
              setForm({ ...form, requirePasskeyRetroactive })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="font-medium">{t("authenticationDestructiveTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("authenticationDestructiveHint")}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              checked={form.requireMfaForDestructive}
              onCheckedChange={(v) => setForm({ ...form, requireMfaForDestructive: v === true })}
              className="mt-0.5"
            />
            {t("authenticationDestructiveEnable")}
          </label>
          {form.requireMfaForDestructive && (
            <div className="grid gap-4 pl-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("authenticationDestructiveLevel")}
                </Label>
                <Select
                  value={String(form.minDestructiveLevel)}
                  onValueChange={(v) => setForm({ ...form, minDestructiveLevel: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("authenticationLevel1")}</SelectItem>
                    <SelectItem value="2">{t("authenticationLevel2")}</SelectItem>
                    <SelectItem value="3">{t("authenticationLevel3")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("authenticationDestructiveTtl")}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.destructiveActionTtlMinutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      destructiveActionTtlMinutes: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 p-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("authenticationGracePeriod")}
            </Label>
            <p className="text-sm text-muted-foreground">{t("authenticationGracePeriodHint")}</p>
            <Input
              type="number"
              min={0}
              max={90}
              className="max-w-32"
              value={form.gracePeriodDays}
              onChange={(e) =>
                setForm({ ...form, gracePeriodDays: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>

          <ExemptUsersPicker
            selected={form.exemptUserIds}
            onChange={(exemptUserIds) => setForm({ ...form, exemptUserIds })}
          />
        </CardContent>
      </Card>

      <SecurityStandardSection />

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={!dirty || saving}
          onClick={() =>
            policy &&
            setForm({
              requireMfaScope: policy.requireMfaScope,
              requireMfaRetroactive: policy.requireMfaRetroactive,
              requireMfaForDestructive: policy.requireMfaForDestructive,
              destructiveActionTtlMinutes: policy.destructiveActionTtlMinutes,
              minDestructiveLevel: policy.minDestructiveLevel,
              requirePasskeyScope: policy.requirePasskeyScope,
              requirePasskeyRetroactive: policy.requirePasskeyRetroactive,
              gracePeriodDays: policy.gracePeriodDays,
              exemptUserIds: policy.exemptUserIds,
            })
          }
        >
          {t("authenticationDiscard")}
        </Button>
        <Button disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? t("authenticationSaving") : t("authenticationSave")}
        </Button>
      </div>
    </div>
  );
}
