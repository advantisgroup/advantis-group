"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { balancedSplit } from "@advantis/convex/performance/onboarding";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { ArrowRightLeft, Scale, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorHandler } from "@/hooks/use-error-handler";
import { cn } from "@/lib/utils";

import { type CaseRow, followUpDue, isOpen, todayIso } from "./shared";

type Person = FunctionReturnType<typeof api.performance.onboarding.assignees>[number];

interface Load {
  userId: Id<"users">;
  name: string;
  member: boolean;
  paused: boolean;
  lead: boolean;
  fresh: number;
  inProgress: number;
  prio: number;
  due: number;
  open: number;
}

/**
 * The "Verteilung" tab for admins and team leads: who has how much, a
 * balancing proposal for unassigned cases, moving cases between people,
 * and the team setup.
 */
export function DistributionPanel({
  cases,
  people,
  isAdmin,
}: {
  cases: CaseRow[];
  people: Person[] | undefined;
  isAdmin: boolean;
}) {
  const today = todayIso();
  const open = cases.filter(isOpen);
  const pool = open.filter((c) => !c.assigneeUserId);

  const loads = useMemo<Load[]>(() => {
    const byUser = new Map<string, Load>();
    for (const p of people ?? []) {
      if (!p.member && !open.some((c) => c.assigneeUserId === p.userId)) continue;
      byUser.set(p.userId, {
        userId: p.userId,
        name: p.name,
        member: p.member,
        paused: p.paused,
        lead: p.lead,
        fresh: 0,
        inProgress: 0,
        prio: 0,
        due: 0,
        open: 0,
      });
    }
    for (const c of open) {
      if (!c.assigneeUserId) continue;
      const l = byUser.get(c.assigneeUserId);
      if (!l) continue;
      l.open++;
      if (c.status === "fresh") l.fresh++;
      else l.inProgress++;
      if (c.prio) l.prio++;
      if (followUpDue(c, today)) l.due++;
    }
    return [...byUser.values()].sort(
      (a, b) => Number(b.member) - Number(a.member) || a.name.localeCompare(b.name, "de"),
    );
  }, [people, open, today]);

  return (
    <div className="space-y-6">
      <TeamLoad loads={loads} pool={pool} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Distribute loads={loads} pool={pool} />
        <Reassign loads={loads} />
      </div>
      <TeamSetup people={people} isAdmin={isAdmin} />
    </div>
  );
}

// ------------------------------------------------------------ overview

function TeamLoad({ loads, pool }: { loads: Load[]; pool: CaseRow[] }) {
  const t = useTranslations("OnboardingCockpit");
  const max = Math.max(1, ...loads.map((l) => l.open));
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Users className="h-4 w-4 text-muted-foreground" />
        {t("dist.loadTitle")}
      </h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("kpi.consultant")}</TableHead>
              <TableHead className="text-right">{t("dist.fresh")}</TableHead>
              <TableHead className="text-right">{t("dist.inProgress")}</TableHead>
              <TableHead className="text-right">{t("prioBadge")}</TableHead>
              <TableHead className="text-right">{t("kpi.due")}</TableHead>
              <TableHead className="text-right">{t("kpi.open")}</TableHead>
              <TableHead className="w-[26%]">{t("kpi.load")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loads.map((l) => (
              <TableRow key={l.userId}>
                <TableCell>
                  <span className="font-medium">{l.name}</span>
                  <span className="ml-2 inline-flex gap-1">
                    {l.lead && <Badge variant="secondary">{t("dist.leadBadge")}</Badge>}
                    {l.paused && <Badge variant="warning">{t("dist.pausedBadge")}</Badge>}
                    {!l.member && <Badge variant="muted">{t("dist.notMemberBadge")}</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{l.fresh}</TableCell>
                <TableCell className="text-right tabular-nums">{l.inProgress}</TableCell>
                <TableCell
                  className={cn("text-right tabular-nums", l.prio > 0 && "text-destructive")}
                >
                  {l.prio}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", l.due > 0 && "text-warn")}>
                  {l.due}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.open}</TableCell>
                <TableCell>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(l.fresh / max) * 100}%` }}
                      title={t("dist.fresh")}
                    />
                    <div
                      className="h-full bg-primary/40"
                      style={{ width: `${(l.inProgress / max) * 100}%` }}
                      title={t("dist.inProgress")}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40">
              <TableCell className="italic">{t("dist.pool")}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {pool.filter((c) => c.status === "fresh").length}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {pool.filter((c) => c.status !== "fresh").length}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {pool.filter((c) => c.prio).length}
              </TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">{pool.length}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {loads.every((l) => !l.member) && <p className="text-xs text-warn">{t("dist.noTeam")}</p>}
    </section>
  );
}

// ---------------------------------------------------------- distribute

function Distribute({ loads, pool }: { loads: Load[]; pool: CaseRow[] }) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const distribute = useMutation(api.performance.onboarding.distribute);
  const [onlyNew, setOnlyNew] = useState(true);
  const eligible = onlyNew ? pool.filter((c) => c.status === "fresh") : pool;
  const [amount, setAmount] = useState<string>("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [proposal, setProposal] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  const recipients = loads.filter((l) => l.member && !l.paused && !excluded.has(l.userId));
  const total = Math.min(eligible.length, Math.max(0, Number(amount || eligible.length) || 0));
  const planned = proposal ? Object.values(proposal).reduce((a, b) => a + b, 0) : 0;

  const compute = () => {
    const split = balancedSplit(
      recipients.map((r) => r.fresh),
      total,
    );
    setProposal(Object.fromEntries(recipients.map((r, i) => [r.userId, split[i]])));
  };

  const apply = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const result = await distribute({
        onlyNew,
        allocations: Object.entries(proposal).map(([userId, count]) => ({
          userId: userId as Id<"users">,
          count,
        })),
      });
      toast.success(t("dist.done", { count: result.assigned }));
      setProposal(null);
      setAmount("");
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-muted-foreground" />
          {t("dist.distributeTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("dist.distributeHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ob-dist-amount">{t("dist.amount")}</Label>
            <Input
              id="ob-dist-amount"
              type="number"
              min={0}
              max={eligible.length}
              className="w-32"
              placeholder={String(eligible.length)}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setProposal(null);
              }}
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="ob-dist-new"
              checked={onlyNew}
              onCheckedChange={(v) => {
                setOnlyNew(v);
                setProposal(null);
              }}
            />
            <Label htmlFor="ob-dist-new">{t("dist.onlyNew")}</Label>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            {t("dist.available", { count: eligible.length })}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("dist.recipients")}</p>
          <div className="flex flex-wrap gap-2">
            {loads
              .filter((l) => l.member)
              .map((l) => {
                const on = !l.paused && !excluded.has(l.userId);
                return (
                  <label
                    key={l.userId}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                      l.paused && "opacity-50",
                    )}
                  >
                    <Checkbox
                      checked={on}
                      disabled={l.paused}
                      onCheckedChange={(v) => {
                        setExcluded((s) => {
                          const next = new Set(s);
                          if (v === true) next.delete(l.userId);
                          else next.add(l.userId);
                          return next;
                        });
                        setProposal(null);
                      }}
                    />
                    {l.name}
                    {l.paused && <span className="text-xs">({t("dist.pausedBadge")})</span>}
                  </label>
                );
              })}
          </div>
        </div>

        <Button
          variant="outline"
          onClick={compute}
          disabled={recipients.length === 0 || total === 0}
        >
          <Scale className="mr-2 h-4 w-4" />
          {t("dist.compute", { count: total })}
        </Button>

        {proposal && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("kpi.consultant")}</TableHead>
                    <TableHead className="text-right">{t("dist.freshNow")}</TableHead>
                    <TableHead className="text-right">{t("dist.plus")}</TableHead>
                    <TableHead className="text-right">{t("dist.after")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.fresh}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          className="ml-auto h-8 w-20 text-right tabular-nums"
                          value={proposal[r.userId] ?? 0}
                          onChange={(e) =>
                            setProposal({
                              ...proposal,
                              [r.userId]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.fresh + (proposal[r.userId] ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className={cn(
                  "text-sm",
                  planned > eligible.length ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {t("dist.planned", { planned, available: eligible.length })}
              </p>
              <Button
                onClick={() => void apply()}
                disabled={busy || planned === 0 || planned > eligible.length}
              >
                {t("dist.apply", { count: planned })}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ reassign

const POOL = "__pool";

function Reassign({ loads }: { loads: Load[] }) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const reassign = useMutation(api.performance.onboarding.reassign);
  const withCases = loads.filter((l) => l.open > 0);
  const [from, setFrom] = useState<string>("");
  const [scope, setScope] = useState<"new" | "open">("new");
  const [count, setCount] = useState("");
  const [to, setTo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const source = loads.find((l) => l.userId === from);
  const available = source ? (scope === "new" ? source.fresh : source.open) : 0;
  const targets = loads.filter((l) => l.member && !l.paused && l.userId !== from);
  const toPool = to.has(POOL);

  const run = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const result = await reassign({
        fromUserId: source.userId,
        toUserIds: toPool ? [] : ([...to] as Id<"users">[]),
        scope,
        count: count ? Number(count) : undefined,
      });
      toast.success(t("dist.moved", { count: result.moved }));
      setCount("");
      setTo(new Set());
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          {t("dist.reassignTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("dist.reassignHint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("dist.from")}</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder={t("dist.choose")} />
              </SelectTrigger>
              <SelectContent>
                {withCases.map((l) => (
                  <SelectItem key={l.userId} value={l.userId}>
                    {l.name} ({l.open})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("dist.which")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "new" | "open")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t("dist.scopeNew")}</SelectItem>
                <SelectItem value="open">{t("dist.scopeOpen")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-re-count">{t("dist.howMany")}</Label>
            <Input
              id="ob-re-count"
              type="number"
              min={1}
              max={available}
              placeholder={source ? t("dist.all", { count: available }) : ""}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("dist.to")}</p>
          <div className="flex flex-wrap gap-2">
            {targets.map((l) => (
              <label
                key={l.userId}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
              >
                <Checkbox
                  checked={to.has(l.userId)}
                  disabled={toPool}
                  onCheckedChange={(v) =>
                    setTo((s) => {
                      const next = new Set(s);
                      if (v === true) next.add(l.userId);
                      else next.delete(l.userId);
                      return next;
                    })
                  }
                />
                {l.name}
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-sm">
              <Checkbox
                checked={toPool}
                onCheckedChange={(v) => setTo(v === true ? new Set([POOL]) : new Set())}
              />
              {t("dist.backToPool")}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t("dist.toHint")}</p>
        </div>
        <Button
          onClick={() => void run()}
          disabled={busy || !source || available === 0 || to.size === 0}
        >
          {t("dist.reassignButton")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------- team setup

function TeamSetup({ people, isAdmin }: { people: Person[] | undefined; isAdmin: boolean }) {
  const t = useTranslations("OnboardingCockpit");
  const handleError = useErrorHandler();
  const save = useMutation(api.performance.onboarding.saveSettings);
  const settings = useQuery(api.performance.onboarding.settings, {});
  const [draft, setDraft] = useState<{
    members: Set<string>;
    paused: Set<string>;
    leads: Set<string>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!settings || !people) return null;
  const state = draft ?? {
    members: new Set<string>(settings.memberUserIds),
    paused: new Set<string>(settings.pausedUserIds),
    leads: new Set<string>(settings.leadUserIds),
  };
  const toggle = (key: "members" | "paused" | "leads", id: string, on: boolean) => {
    const next = { ...state, [key]: new Set(state[key]) };
    if (on) next[key].add(id);
    else next[key].delete(id);
    if (key === "members" && !on) next.paused.delete(id);
    setDraft(next);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await save({
        memberUserIds: [...state.members] as Id<"users">[],
        pausedUserIds: [...state.paused] as Id<"users">[],
        leadUserIds: isAdmin ? ([...state.leads] as Id<"users">[]) : undefined,
      });
      toast.success(t("dist.teamSaved"));
      setDraft(null);
    } catch (e) {
      handleError(e, t("case.saveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("dist.teamTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("dist.teamHint")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("dist.person")}</TableHead>
                <TableHead className="text-center">{t("dist.member")}</TableHead>
                <TableHead className="text-center">{t("dist.paused")}</TableHead>
                <TableHead className="text-center">{t("dist.lead")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={state.members.has(p.userId)}
                      onCheckedChange={(v) => toggle("members", p.userId, v === true)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={state.paused.has(p.userId)}
                      disabled={!state.members.has(p.userId)}
                      onCheckedChange={(v) => toggle("paused", p.userId, v === true)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={state.leads.has(p.userId)}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => toggle("leads", p.userId, v === true)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {settings.updatedByName
              ? t("dist.teamUpdated", { name: settings.updatedByName })
              : t("dist.teamEmpty")}
          </p>
          <Button onClick={() => void submit()} disabled={busy || !draft}>
            {t("dist.teamSave")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
