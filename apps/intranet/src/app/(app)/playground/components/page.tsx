"use client";

import { useState } from "react";

import {
  CircleCheck,
  Dices,
  Info,
  Lightbulb,
  Plug,
  Plus,
  Sparkles,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { MetricRow, Panel } from "@/components/admin/overview/primitives";
import { Mark, PROVIDERS_LIST, providerName } from "@/components/branding/ProviderMark";
import { FieldLabel, FormDialog } from "@/components/compose/FormDialog";
import { Demo } from "@/components/playground/Demo";
import { Inspector } from "@/components/playground/Inspector";
import { LanguageCheck } from "@/components/playground/LanguageCheck";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button";
import { CountTabs } from "@/components/ui/count-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TogglePill } from "@/components/ui/filter-pill";
import { Input } from "@/components/ui/input";
import { Kpi, KpiStrip } from "@/components/ui/kpi-strip";
import { SettingsRow, SettingsSection } from "@/components/ui/settings-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NOTIFICATION_TYPES, notificationVisual } from "@/lib/notification-kinds";
import { cn } from "@/lib/utils";

type Variant = NonNullable<ButtonProps["variant"]>;
type Size = NonNullable<ButtonProps["size"]>;

const VARIANTS: Variant[] = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
  "sky",
  "violet",
  "rose",
  "emerald",
  "prism",
  "premium",
  "sunrise",
];
const SIZES: Size[] = ["xs", "sm", "default", "lg", "xl"];

/** The classes only this variant adds — everything every variant shares is the base. */
function variantClasses(variant: Variant) {
  const all = VARIANTS.map((v) => new Set(buttonVariants({ variant: v }).split(" ")));
  return buttonVariants({ variant })
    .split(" ")
    .filter((cls) => !all.every((set) => set.has(cls)))
    .join(" ");
}
const MILESTONES = [10, 25, 50, 100];

const BADGES = [
  "default",
  "secondary",
  "outline",
  "muted",
  "success",
  "warning",
  "destructive",
] as const;

const TICKETS = [
  { id: "printer", status: "open" },
  { id: "vpn", status: "open" },
  { id: "laptop", status: "waiting" },
  { id: "badge", status: "done" },
  { id: "headset", status: "done" },
  { id: "monitor", status: "open" },
] as const;
type TicketStatus = (typeof TICKETS)[number]["status"];
const STATUS_DOT: Record<TicketStatus, string> = {
  open: "bg-warn",
  waiting: "bg-info",
  done: "bg-ok",
};

const IDEAS = ["plants", "music", "standing", "snacks", "quiet"];

function randomKpis() {
  const r = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
  return { people: r(38, 52), tickets: r(0, 24), absences: r(0, 9), uptime: r(97, 100) };
}

export default function PlaygroundComponentsPage() {
  const t = useTranslations("Playground");

  const [variant, setVariant] = useState<Variant>("default");
  const [size, setSize] = useState<Size>("default");
  const [presses, setPresses] = useState(0);

  const [kpis, setKpis] = useState(randomKpis);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"all" | TicketStatus>("all");
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);

  const [ideas, setIdeas] = useState<string[]>([]);
  const [settings, setSettings] = useState({ digest: true, sounds: false });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");

  function press() {
    const next = presses + 1;
    setPresses(next);
    if (MILESTONES.includes(next)) toast(t(`components.buttons.milestones.${next}`));
  }

  const visibleTickets = TICKETS.filter(
    (ticket) =>
      (tab === "all" || ticket.status === tab) &&
      (statuses.length === 0 || statuses.includes(ticket.status)),
  );
  const count = (status: TicketStatus) =>
    TICKETS.filter((ticket) => ticket.status === status).length;

  return (
    <>
      <Demo
        title={t("components.buttons.title")}
        description={t("components.buttons.description")}
        source="components/ui/button.tsx"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map((v) => (
              <TogglePill key={v} active={variant === v} onClick={() => setVariant(v)}>
                {v}
              </TogglePill>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((s) => (
              <TogglePill key={s} active={size === s} onClick={() => setSize(s)}>
                {s}
              </TogglePill>
            ))}
          </div>
          <div className="grid min-h-28 place-items-center rounded-lg bg-muted/40">
            <Button variant={variant} size={size} onClick={press}>
              <Sparkles />
              {t("components.buttons.pressMe")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[12px]">
              {`<Button variant="${variant}" size="${size}">`}
            </code>
            <span className="text-[12.5px] tabular-nums text-muted-foreground">
              {t("components.buttons.presses", { count: presses })}
            </span>
          </div>
        </div>
      </Demo>

      <Demo
        title={t("components.sunrise.title")}
        description={t("components.sunrise.description")}
        source="components/ui/button.tsx · .btn-sunrise in app/globals.css"
        className="grid gap-0 overflow-visible p-0 sm:grid-cols-2"
      >
        {(["light", "dark"] as const).map((ground) => (
          <div
            key={ground}
            className={cn(
              "flex flex-col items-center justify-center gap-10 px-6 py-14",
              ground === "light"
                ? "rounded-t-xl bg-white sm:rounded-l-xl sm:rounded-tr-none"
                : "rounded-b-xl bg-zinc-950 sm:rounded-r-xl sm:rounded-bl-none",
            )}
          >
            <Button variant="sunrise" size="lg">
              <Sparkles />
              {t("components.sunrise.cta")}
            </Button>
            <div className="flex items-center gap-6">
              <Button variant="sunrise">{t("components.sunrise.small")}</Button>
              <Button variant="sunrise" size="sm">
                {t("components.sunrise.small")}
              </Button>
            </div>
            <p
              className={cn("text-[12px]", ground === "light" ? "text-zinc-500" : "text-zinc-400")}
            >
              {t(`components.sunrise.${ground}`)}
            </p>
          </div>
        ))}
      </Demo>

      <Demo
        title={t("components.variants.title")}
        description={t("components.variants.description")}
        source="components/ui/button.tsx"
      >
        <Inspector
          items={VARIANTS}
          getKey={(v) => v}
          getLabel={(v) => v}
          gridClassName="flex flex-wrap gap-3"
          tileClassName="rounded-lg p-2"
          renderTile={(v) => (
            <span className={buttonVariants({ variant: v, size: "sm" })}>{v}</span>
          )}
          renderFocus={(v) => (
            <span className="grid place-items-center px-4 py-10">
              <span className={buttonVariants({ variant: v, size: "lg" })}>
                <Sparkles />
                {v}
              </span>
            </span>
          )}
          getFields={(v) => [
            { label: t("inspector.fields.variant"), value: v },
            { label: t("inspector.fields.jsx"), value: `<Button variant="${v}">…</Button>` },
            { label: t("inspector.fields.classes"), value: variantClasses(v) },
          ]}
        />
      </Demo>
      <Demo
        title={t("components.badges.title")}
        description={t("components.badges.description")}
        source="components/ui/badge.tsx"
      >
        <Inspector
          items={BADGES}
          getKey={(b) => b}
          getLabel={(b) => b}
          gridClassName="flex flex-wrap gap-1.5"
          tileClassName="rounded-md p-1"
          renderTile={(b) => <Badge variant={b}>{b}</Badge>}
          renderFocus={(b) => (
            <span className="grid place-items-center py-8">
              <Badge variant={b} className="scale-125">
                {b}
              </Badge>
            </span>
          )}
          getFields={(b) => [
            { label: t("inspector.fields.variant"), value: b },
            { label: t("inspector.fields.jsx"), value: `<Badge variant="${b}">…</Badge>` },
          ]}
        />
      </Demo>

      <Demo
        title={t("components.kpis.title")}
        description={t("components.kpis.description")}
        source="components/ui/kpi-strip.tsx"
        action={
          <Button variant="outline" size="xs" onClick={() => setKpis(randomKpis())}>
            <Dices />
            {t("components.kpis.shuffle")}
          </Button>
        }
        className="p-0"
      >
        <KpiStrip className="rounded-xl border-0">
          <Kpi label={t("components.kpis.people")} value={kpis.people} featured />
          <Kpi
            label={t("components.kpis.tickets")}
            value={kpis.tickets}
            tone={kpis.tickets > 15 ? "warn" : "neutral"}
            hint={kpis.tickets > 15 ? t("components.kpis.busy") : undefined}
          />
          <Kpi label={t("components.kpis.absences")} value={kpis.absences} />
          <Kpi
            label={t("components.kpis.uptime")}
            value={`${kpis.uptime}%`}
            tone={kpis.uptime < 98 ? "critical" : "neutral"}
          />
        </KpiStrip>
      </Demo>

      <Demo
        title={t("components.loading.title")}
        description={t("components.loading.description")}
        source="components/ui/skeleton.tsx"
        action={
          <div className="flex items-center gap-2">
            <Switch checked={loading} onCheckedChange={setLoading} id="loading" />
            <label htmlFor="loading" className="text-[13px]">
              {t("components.loading.toggle")}
            </label>
          </div>
        }
      >
        <div className="flex items-center gap-3">
          {loading ? (
            <>
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </>
          ) : (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
                AG
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("components.loading.name")}</p>
                <p className="text-[13px] text-muted-foreground">{t("components.loading.line")}</p>
              </div>
            </>
          )}
        </div>
      </Demo>

      <Demo
        title={t("components.filters.title")}
        description={t("components.filters.description")}
        source="components/ui/count-tabs.tsx · components/ui/filter-pill.tsx"
      >
        <CountTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "all", label: t("components.filters.all"), count: TICKETS.length },
            { value: "open", label: t("components.filters.status.open"), count: count("open") },
            {
              value: "waiting",
              label: t("components.filters.status.waiting"),
              count: count("waiting"),
            },
            { value: "done", label: t("components.filters.status.done"), count: count("done") },
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(["open", "waiting", "done"] as const).map((status) => (
            <TogglePill
              key={status}
              active={statuses.includes(status)}
              dotClassName={STATUS_DOT[status]}
              onClick={() =>
                setStatuses((current) =>
                  current.includes(status)
                    ? current.filter((s) => s !== status)
                    : [...current, status],
                )
              }
            >
              {t(`components.filters.status.${status}`)}
            </TogglePill>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-border/60 rounded-lg border border-border/70">
          {visibleTickets.length === 0 ? (
            <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              {t("components.filters.nothing")}
            </li>
          ) : (
            visibleTickets.map((ticket) => (
              <li key={ticket.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                <span className={`size-1.5 rounded-full ${STATUS_DOT[ticket.status]}`} />
                <span className="flex-1">{t(`components.filters.tickets.${ticket.id}`)}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {t(`components.filters.status.${ticket.status}`)}
                </span>
              </li>
            ))
          )}
        </ul>
      </Demo>

      <Demo
        title={t("components.empty.title")}
        description={t("components.empty.description")}
        source="components/ui/empty-state.tsx"
        className={ideas.length === 0 ? "p-0" : undefined}
      >
        {ideas.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={<Lightbulb />}
            title={t("components.empty.emptyTitle")}
            description={t("components.empty.emptyHint")}
            action={
              <Button size="sm" onClick={() => setIdeas([IDEAS[0]])}>
                <Plus />
                {t("components.empty.add")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <ul className="space-y-1.5">
              {ideas.map((idea) => (
                <li key={idea} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  {t(`components.empty.ideas.${idea}`)}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={ideas.length === IDEAS.length}
                onClick={() => setIdeas(IDEAS.slice(0, ideas.length + 1))}
              >
                <Plus />
                {t("components.empty.add")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIdeas([])}>
                <Trash2 />
                {t("components.empty.clear")}
              </Button>
            </div>
          </div>
        )}
      </Demo>

      <SettingsSection
        title={t("components.settings.title")}
        description={t("components.settings.description")}
      >
        {(["digest", "sounds"] as const).map((key) => (
          <SettingsRow
            key={key}
            title={t(`components.settings.${key}.title`)}
            description={t(`components.settings.${key}.hint`)}
            control={
              <Switch
                checked={settings[key]}
                onCheckedChange={(checked) => {
                  setSettings((current) => ({ ...current, [key]: checked }));
                  toast.success(t("components.settings.saved"));
                }}
              />
            }
          />
        ))}
      </SettingsSection>

      <Demo
        title={t("components.feedback.title")}
        description={t("components.feedback.description")}
        source="components/compose/FormDialog.tsx · sonner"
      >
        <TooltipProvider>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus />
              {t("components.feedback.openDialog")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.success(t("components.feedback.toastSuccess"))}
            >
              {t("components.feedback.success")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.error(t("components.feedback.toastError"))}
            >
              {t("components.feedback.error")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast(t("components.feedback.toastDeleted"), {
                  action: {
                    label: t("components.feedback.undo"),
                    onClick: () => toast.success(t("components.feedback.toastRestored")),
                  },
                })
              }
            >
              {t("components.feedback.withUndo")}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                  aria-label={t("components.feedback.tooltipLabel")}
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("components.feedback.tooltip")}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <FormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={t("components.feedback.dialogTitle")}
          description={t("components.feedback.dialogHint")}
          checks={[{ key: "name", label: t("components.feedback.name"), done: !!name.trim() }]}
          submitLabel={t("components.feedback.dialogSubmit")}
          onSubmit={() => {
            toast.success(t("components.feedback.hello", { name: name.trim() || "?" }));
            setName("");
            setDialogOpen(false);
          }}
        >
          <div className="space-y-1.5">
            <FieldLabel>{t("components.feedback.name")}</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
        </FormDialog>
      </Demo>

      <Demo
        title={t("components.panel.title")}
        description={t("components.panel.description")}
        source="components/admin/overview/primitives.tsx"
        className="border-0 bg-transparent p-0"
      >
        <Panel
          icon={<Plug />}
          title={t("components.panel.panelTitle")}
          description={t("components.panel.panelHint")}
          bodyClassName="p-3"
        >
          <MetricRow
            icon={CircleCheck}
            label={t("components.panel.rows.ok")}
            sublabel={t("components.panel.rows.okHint")}
            tone="ok"
            trailing={<Badge variant="success">{t("design.status.healthy")}</Badge>}
          />
          <MetricRow
            icon={TriangleAlert}
            label={t("components.panel.rows.warn")}
            sublabel={t("components.panel.rows.warnHint")}
            tone="warn"
            trailing={<Badge variant="warning">{t("design.status.degraded")}</Badge>}
          />
          <MetricRow icon={Sparkles} label={t("components.panel.rows.neutral")} value={42} />
        </Panel>
      </Demo>

      <Demo
        title={t("components.notifications.title")}
        description={t("components.notifications.description")}
        source="lib/notification-kinds.ts"
      >
        <Inspector
          items={NOTIFICATION_TYPES}
          getKey={(type) => type}
          getLabel={(type) => type}
          gridClassName="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
          tileClassName="w-full rounded-lg border border-border/60 bg-card px-2.5 py-2 text-left"
          renderTile={(type) => {
            const { icon: Icon, tint } = notificationVisual(type);
            return (
              <span className="flex items-center gap-2.5">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", tint)}>
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 truncate font-mono text-[11.5px]">{type}</span>
              </span>
            );
          }}
          renderFocus={(type) => {
            const { icon: Icon, tint } = notificationVisual(type);
            return (
              <span className="flex flex-col items-center gap-3 py-5">
                <span className={cn("grid size-14 place-items-center rounded-full", tint)}>
                  <Icon className="size-6" />
                </span>
                <span className="font-mono text-[12px]">{type}</span>
              </span>
            );
          }}
          getFields={(type) => {
            const { icon: Icon, tint } = notificationVisual(type);
            return [
              { label: t("inspector.fields.type"), value: type },
              { label: t("inspector.fields.icon"), value: Icon.displayName ?? "Bell" },
              { label: t("inspector.fields.tint"), value: tint },
              { label: t("inspector.fields.code"), value: `notificationVisual("${type}")` },
            ];
          }}
        />{" "}
      </Demo>

      <Demo
        title={t("components.logos.title")}
        description={t("components.logos.description")}
        source="components/branding/ProviderMark.tsx"
      >
        <Inspector
          items={PROVIDERS_LIST}
          getKey={(provider) => provider}
          getLabel={(provider) => providerName(provider)}
          gridClassName="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          tileClassName="w-full rounded-lg border border-border/60 bg-card px-2 py-4"
          renderTile={(provider) => (
            <span className="flex flex-col items-center gap-2">
              <Mark provider={provider} className="size-7" />
              <span className="text-[12px] text-muted-foreground">{providerName(provider)}</span>
            </span>
          )}
          renderFocus={(provider) => (
            <span className="flex flex-col items-center gap-3 py-5">
              <Mark provider={provider} className="size-14" />
              <span className="text-[13px] font-medium">{providerName(provider)}</span>
            </span>
          )}
          getFields={(provider) => [
            { label: t("inspector.fields.key"), value: provider },
            { label: t("inspector.fields.name"), value: providerName(provider) },
            { label: t("inspector.fields.jsx"), value: `<Mark provider="${provider}" />` },
          ]}
        />{" "}
      </Demo>

      <Demo
        title={t("components.language.title")}
        description={t("components.language.description")}
        className="border-0 bg-transparent p-0"
      >
        <LanguageCheck />
      </Demo>
    </>
  );
}
