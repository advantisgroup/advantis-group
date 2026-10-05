"use client";

import { useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { Pencil, Plus, Settings2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PersonPicker } from "@/components/people/PersonPicker";
import { usePerformanceAccess } from "@/components/performance/PerformanceAccess";
import { PerformanceShell, usePerformanceGate } from "@/components/performance/PerformanceShell";
import { PerformancePageSkeleton } from "@/components/performance/PerformanceSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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

type DashboardRow = FunctionReturnType<typeof api.performance.dashboards.list>[number];

/** Name plus the intranet teams/departments whose members belong to it. */
function DashboardDialog({
  open,
  onOpenChange,
  dashboard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` creates a new dashboard. */
  dashboard: DashboardRow | null;
}) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const options = useQuery(api.performance.dashboards.orgOptions, open ? {} : "skip");
  const create = useMutation(api.performance.dashboards.create);
  const update = useMutation(api.performance.dashboards.update);
  const [name, setName] = useState(dashboard?.name ?? "");
  const [teamIds, setTeamIds] = useState<Set<string>>(
    () => new Set(dashboard?.teams.map((x) => x.id) ?? []),
  );
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(
    () => new Set(dashboard?.departments.map((x) => x.id) ?? []),
  );
  const [saving, setSaving] = useState(false);

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name,
        teamIds: [...teamIds] as Id<"teams">[],
        departmentIds: [...departmentIds] as Id<"departments">[],
      };
      if (dashboard) await update({ companyId: dashboard.companyId, ...payload });
      else await create(payload);
      toast.success(t("settingsSaved"));
      onOpenChange(false);
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  const group = (
    title: string,
    items: { id: string; name: string; hasLead: boolean }[] | undefined,
    selected: Set<string>,
    onToggle: (id: string) => void,
  ) => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {items === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">–</p>
      ) : (
        <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox checked={selected.has(item.id)} onCheckedChange={() => onToggle(item.id)} />
              <span className="truncate">{item.name}</span>
              {!item.hasLead && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {t("settingsNoLead")}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dashboard ? t("settingsEditTitle") : t("settingsNewTitle")}</DialogTitle>
          <DialogDescription>{t("settingsDialogHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-name">{t("settingsNameLabel")}</Label>
            <Input
              id="dashboard-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sales"
            />
          </div>
          {group(t("settingsTeams"), options?.teams, teamIds, (id) =>
            setTeamIds((s) => toggle(s, id)),
          )}
          {group(t("settingsDepartments"), options?.departments, departmentIds, (id) =>
            setDepartmentIds((s) => toggle(s, id)),
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("topicCancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>
            {t("topicSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Report names on one dashboard and the intranet person behind each. */
function EmployeeLinks({ dashboard }: { dashboard: DashboardRow }) {
  const t = useTranslations("Performance");
  const handleError = useErrorHandler();
  const employees = useQuery(api.performance.dashboards.employees, {
    companyId: dashboard.companyId,
  });
  const link = useMutation(api.performance.dashboards.linkEmployee);
  const setActive = useMutation(api.performance.dashboards.setEmployeeActive);
  const autoLink = useMutation(api.performance.dashboards.autoLink);

  async function runAutoLink() {
    try {
      const { fromLogins, byName } = await autoLink({ companyId: dashboard.companyId });
      toast.success(t("settingsAutoLinkDone", { count: fromLogins + byName }));
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">
            {t("settingsLinksTitle", { dashboard: dashboard.name })}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("settingsLinksHint")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void runAutoLink()}>
          <Sparkles className="mr-2 h-4 w-4" />
          {t("settingsAutoLink")}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {employees === undefined ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : employees.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("settingsNoEmployees")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settingsColReportName")}</TableHead>
                <TableHead>{t("settingsColPerson")}</TableHead>
                <TableHead className="w-24 text-right">{t("settingsColShown")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id} className={e.active ? undefined : "opacity-60"}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <PersonPicker
                        className="w-64 max-w-full"
                        value={e.user?.id ?? null}
                        placeholder={t("settingsPickPerson")}
                        label={t("settingsColPerson")}
                        noneLabel={t("settingsUnlink")}
                        onChange={(userId) =>
                          void link({
                            employeeId: e.id,
                            userId: (userId as Id<"users"> | null) ?? null,
                          }).catch(handleError)
                        }
                      />
                      {e.suggestion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            void link({ employeeId: e.id, userId: e.suggestion!.id }).catch(
                              handleError,
                            )
                          }
                        >
                          {t("settingsUseSuggestion", { name: e.suggestion.name })}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={e.active}
                      onCheckedChange={(active) =>
                        void setActive({ employeeId: e.id, active }).catch(handleError)
                      }
                      aria-label={t("settingsColShown")}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function PerformanceSettingsPage() {
  const t = useTranslations("Performance");
  const { loading, me } = usePerformanceGate((m) => m.isAdmin);
  const { dashboard: current } = usePerformanceAccess();
  const dashboards = useQuery(api.performance.dashboards.list, me ? {} : "skip");
  const [dialog, setDialog] = useState<{ dashboard: DashboardRow | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) return <PerformancePageSkeleton />;
  if (!me) return null;

  const selected =
    dashboards?.find((d) => d.companyId === selectedId) ??
    dashboards?.find((d) => d.companyId === current?.companyId) ??
    dashboards?.[0];

  return (
    <PerformanceShell
      title={t("settingsTitle")}
      description={t("settingsIntro")}
      icon={Settings2}
      actions={
        <Button size="sm" onClick={() => setDialog({ dashboard: null })}>
          <Plus className="mr-2 h-4 w-4" />
          {t("settingsNew")}
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        {dashboards === undefined
          ? [0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)
          : dashboards.map((d) => (
              <Card
                key={d.companyId}
                className={
                  selected?.companyId === d.companyId ? "ring-2 ring-primary/40" : "cursor-pointer"
                }
                onClick={() => setSelectedId(d.companyId)}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <CardTitle className="text-base">{d.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={t("settingsEditTitle")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialog({ dashboard: d });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1">
                    {[...d.teams, ...d.departments].length === 0 ? (
                      <span className="text-muted-foreground">{t("settingsNoTeams")}</span>
                    ) : (
                      [...d.teams, ...d.departments].map((x) => (
                        <Badge key={x.id} variant="muted">
                          {x.name}
                        </Badge>
                      ))
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    {t("settingsLinkedCount", { linked: d.linkedCount, total: d.employeeCount })}
                  </p>
                </CardContent>
              </Card>
            ))}
      </div>

      {selected && <EmployeeLinks key={selected.companyId} dashboard={selected} />}

      {dialog && (
        <DashboardDialog
          key={dialog.dashboard?.companyId ?? "new"}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          dashboard={dialog.dashboard}
        />
      )}
    </PerformanceShell>
  );
}
