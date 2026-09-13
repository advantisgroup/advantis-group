"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import {
  BookOpen,
  CheckCircle2,
  MessageSquareQuote,
  PhoneCall,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/components/Link";
import { FlowPlayer } from "@/components/sales-cockpit/FlowPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFileSize } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Project = NonNullable<
  ReturnType<typeof useQuery<typeof api.salesCockpit.listProjects>>
>[number];

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-warning/25 px-0.5 text-inherit">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

function InstantResults({
  query,
  projects,
  onPick,
}: {
  query: string;
  projects: Project[];
  onPick: (projectId: Id<"salesCockpitProjects">, wegId: string) => void;
}) {
  const t = useTranslations("SalesCockpit");
  const hits = useQuery(api.salesCockpit.searchLexikon, { query });
  const q = query.toLowerCase();

  const objections = useMemo(
    () =>
      projects.flatMap((project) =>
        project.wege.flatMap((weg) =>
          weg.einwaende
            .filter((e) => `${e.einwand} ${e.antwort}`.toLowerCase().includes(q))
            .map((e, i) => ({ project, weg, objection: e, key: `${weg.id}-${i}` })),
        ),
      ),
    [projects, q],
  );

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-border/70 bg-card p-2">
        <h2 className="flex items-center gap-2 px-3 pb-1 pt-2 text-[15px] font-semibold">
          <MessageSquareQuote className="size-4 text-muted-foreground" />
          {t("instantObjections")}
          <span className="text-sm font-normal tabular-nums text-muted-foreground">
            {objections.length}
          </span>
        </h2>
        {objections.length === 0 ? (
          <p className="px-3 py-5 text-sm text-muted-foreground">{t("instantNoObjections")}</p>
        ) : (
          <ul className="max-h-96 space-y-0.5 overflow-y-auto">
            {objections.slice(0, 12).map(({ project, weg, objection, key }) => (
              <li key={key}>
                <button
                  type="button"
                  data-shortcut-item
                  onClick={() => onPick(project._id, weg.id)}
                  className="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                >
                  <span className="block text-sm font-medium">
                    „{highlight(objection.einwand, query)}"
                  </span>
                  <span className="mt-0.5 line-clamp-3 block text-sm text-muted-foreground">
                    {highlight(objection.antwort, query)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground/80">
                    {project.titel} · {weg.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-2">
        <h2 className="flex items-center gap-2 px-3 pb-1 pt-2 text-[15px] font-semibold">
          <BookOpen className="size-4 text-muted-foreground" />
          {t("instantLexikon")}
          {hits && (
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {hits.length}
            </span>
          )}
        </h2>
        {hits === undefined ? (
          <p className="px-3 py-5 text-sm text-muted-foreground">{t("loading")}</p>
        ) : hits.length === 0 ? (
          <p className="px-3 py-5 text-sm text-muted-foreground">{t("lexNoHits")}</p>
        ) : (
          <ul className="max-h-96 space-y-0.5 overflow-y-auto">
            {hits.map((h) => (
              <li key={h._id} className="rounded-lg px-3 py-2.5">
                <p className="text-sm font-medium">{highlight(h.titel, query)}</p>
                {h.snippet && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {highlight(h.snippet, query)}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {h.fileName} · {formatFileSize(h.size)}
                  {h.tags.map((tag) => (
                    <Badge key={tag} variant="muted">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FileList({
  files,
}: {
  files: { id: string; name: string; size: number; storageId: Id<"_storage"> }[];
}) {
  const t = useTranslations("SalesCockpit");
  const urls = useQuery(
    api.files.getUrls,
    files.length > 0 ? { storageIds: files.map((f) => f.storageId) } : "skip",
  );
  if (files.length === 0) return null;
  return (
    <ul className="divide-y divide-border/60">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2.5 px-1 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatFileSize(f.size)}
          </span>
          {urls?.[f.storageId] && (
            <a
              href={urls[f.storageId]!}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t("openFile")}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function Cockpit({ project, initialWegId }: { project: Project; initialWegId: string | null }) {
  const t = useTranslations("SalesCockpit");
  const [wegId, setWegId] = useState<string | null>(initialWegId);
  const weg = project.wege.find((w) => w.id === wegId) ?? null;

  useEffect(() => setWegId(initialWegId), [initialWegId]);

  const allFiles = [
    ...project.files.plan.map((f) => ({ ...f, cat: t("catPlan") })),
    ...project.files.scripte.map((f) => ({ ...f, cat: t("catScript") })),
    ...project.files.dateien.map((f) => ({ ...f, cat: t("catDatei") })),
  ];

  const listRow = (icon: ReactNode, text: string, i: number) => (
    <li key={i} className="flex items-start gap-2.5 py-2 text-sm">
      {icon}
      <span>{text}</span>
    </li>
  );

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <p className="text-xs font-medium text-muted-foreground">
          {t("einstiegssatz")} · {project.titel}
        </p>
        <p className="mt-2 text-lg leading-relaxed text-balance">
          {project.einstiegssatz || (
            <span className="text-muted-foreground">{t("keinEinstiegssatz")}</span>
          )}
        </p>
      </section>

      {/* Keyed by flow id — switching projects must remount, not reuse, the
          player, or its currentId would still point at a node from the
          previous flow. */}
      {project.flow ? (
        <FlowPlayer key={project.flow._id} flowId={project.flow._id} />
      ) : (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t("wegWaehlen")}</p>
          {project.wege.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("keineWege")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {project.wege.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={w.id === wegId}
                  onClick={() => setWegId(w.id)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    w.id === wegId
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/70 hover:border-border hover:bg-accent/60",
                  )}
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {weg && (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <Tabs defaultValue="einwaende">
            <TabsList>
              <TabsTrigger value="einwaende">{t("tabEinwandbehandlung")}</TabsTrigger>
              <TabsTrigger value="benefits">{t("tabBenefits")}</TabsTrigger>
              <TabsTrigger value="ziele">{t("tabZiele")}</TabsTrigger>
            </TabsList>
            <TabsContent value="einwaende" className="pt-3">
              {weg.einwaende.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("keineEinwaende")}</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {weg.einwaende.map((e, i) => (
                    <li key={i} className="py-3">
                      <p className="text-sm font-medium">„{e.einwand}"</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {e.antwort}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="benefits" className="pt-3">
              {(() => {
                const items = [
                  ...(weg.benefit ? weg.benefit.split("\n").filter(Boolean) : []),
                  ...project.benefits,
                ];
                return items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("keineBenefits")}</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {items.map((b, i) =>
                      listRow(
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />,
                        b,
                        i,
                      ),
                    )}
                  </ul>
                );
              })()}
            </TabsContent>
            <TabsContent value="ziele" className="pt-3">
              {(() => {
                const items = [
                  ...(weg.ziele ? weg.ziele.split("\n").filter(Boolean) : []),
                  ...project.ziele,
                ];
                return items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("keineZiele")}</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {items.map((z, i) =>
                      listRow(
                        <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" />,
                        z,
                        i,
                      ),
                    )}
                  </ul>
                );
              })()}
            </TabsContent>
          </Tabs>
        </section>
      )}

      {project.sfInput && (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("sfInput")}</p>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {project.sfInput}
          </pre>
        </section>
      )}

      {allFiles.length > 0 && (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="mb-1 text-[15px] font-semibold">{t("unterlagen")}</h2>
          <FileList files={allFiles} />
        </section>
      )}
    </div>
  );
}

export default function SalesCockpitHomePage() {
  const t = useTranslations("SalesCockpit");
  const projects = useQuery(api.salesCockpit.listProjects);
  const [activeProjectId, setActiveProjectId] = useState<Id<"salesCockpitProjects"> | null>(null);
  const [pickedWegId, setPickedWegId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const activeProject = useMemo(
    () => projects?.find((p) => p._id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  return (
    <div>
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchInput("");
          }}
          placeholder={t("instantPlaceholder")}
          className="h-11 rounded-xl pl-10 pr-10"
        />
        {searchInput && (
          <button
            type="button"
            aria-label={t("closeResults")}
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {searchQuery.length >= 2 && projects && (
        <InstantResults
          query={searchQuery}
          projects={projects}
          onPick={(projectId, wegId) => {
            setActiveProjectId(projectId);
            setPickedWegId(wegId);
            setSearchInput("");
          }}
        />
      )}

      <h2 className="mb-3 mt-1 text-[15px] font-semibold">{t("welchesProjekt")}</h2>
      {projects === undefined ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<PhoneCall />}
          title={t("keineProjekte")}
          action={
            <Button asChild size="sm">
              <Link href="/sales-cockpit/projekte/new">
                <Plus />
                {t("neuesProjekt")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p._id}
              type="button"
              data-shortcut-item
              aria-pressed={p._id === activeProjectId}
              onClick={() => {
                setActiveProjectId(p._id);
                setPickedWegId(null);
              }}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-colors",
                p._id === activeProjectId
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/70 hover:border-border hover:bg-accent/40",
              )}
            >
              <span className="block text-sm font-medium">{p.titel}</span>
              <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                {t("start")}: {p.start || "–"} · {p.wege.length} {t("wege")}
              </span>
            </button>
          ))}
        </div>
      )}

      {activeProject && (
        <Cockpit key={activeProject._id} project={activeProject} initialWegId={pickedWegId} />
      )}
    </div>
  );
}
