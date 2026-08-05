"use client";

import { useMemo, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useQuery } from "convex/react";
import { CheckCircle2, PhoneCall, Search, Target } from "lucide-react";
import { useTranslations } from "next-intl";

import { FlowPlayer } from "@/components/sales-cockpit/FlowPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function LexikonSearchResults({ query, onClose }: { query: string; onClose: () => void }) {
  const t = useTranslations("SalesCockpit");
  const hits = useQuery(api.salesCockpit.searchLexikon, { query });

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 pt-5">
        <h2 className="text-base font-semibold">{t("lexTreffer", { query })}</h2>
        {hits === undefined ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : hits.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t("lexNoHits")}</p>
        ) : (
          hits.map((h) => (
            <div key={h._id} className="rounded-lg border border-border/70 p-3.5">
              <h4 className="mb-1 text-sm font-semibold">{highlight(h.titel, query)}</h4>
              {h.snippet && (
                <p className="text-sm text-muted-foreground">{highlight(h.snippet, query)}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {h.fileName} · {formatFileSize(h.size)}
                {h.tags.map((tag) => (
                  <Badge key={tag} variant="warning">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("closeResults")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FileList({
  files,
}: {
  files: { id: string; name: string; size: number; storageId: Id<"_storage"> }[];
}) {
  const urls = useQuery(
    api.files.getUrls,
    files.length > 0 ? { storageIds: files.map((f) => f.storageId) } : "skip",
  );
  if (files.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
          {urls?.[f.storageId] && (
            <a
              href={urls[f.storageId]!}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Öffnen
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function Cockpit({ project }: { project: Project }) {
  const t = useTranslations("SalesCockpit");
  const [wegId, setWegId] = useState<string | null>(null);
  const weg = project.wege.find((w) => w.id === wegId) ?? null;

  const allFiles = [
    ...project.files.plan.map((f) => ({ ...f, cat: t("catPlan") })),
    ...project.files.scripte.map((f) => ({ ...f, cat: t("catScript") })),
    ...project.files.dateien.map((f) => ({ ...f, cat: t("catDatei") })),
  ];

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-[#101D33] to-[#22375C] p-6 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
          {t("einstiegssatz")} · {project.titel}
        </p>
        <p className="mt-2 text-lg font-medium leading-relaxed">
          {project.einstiegssatz || <i className="text-white/70">{t("keinEinstiegssatz")}</i>}
        </p>
      </div>

      {/* Keyed by flow id — switching projects must remount, not reuse, the
          player, or its currentId would still point at a node from the
          previous flow. */}
      {project.flow ? (
        <FlowPlayer key={project.flow._id} flowId={project.flow._id} />
      ) : (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("wegWaehlen")}
          </p>
          {project.wege.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">{t("keineWege")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {project.wege.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWegId(w.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                    w.id === wegId
                      ? "border-primary bg-primary text-primary-foreground shadow"
                      : "border-border hover:border-primary hover:text-primary",
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
        <Card>
          <CardContent className="pt-5">
            <Tabs defaultValue="einwaende">
              <TabsList>
                <TabsTrigger value="einwaende">{t("tabEinwandbehandlung")}</TabsTrigger>
                <TabsTrigger value="benefits">{t("tabBenefits")}</TabsTrigger>
                <TabsTrigger value="ziele">{t("tabZiele")}</TabsTrigger>
              </TabsList>
              <TabsContent value="einwaende" className="space-y-2.5 pt-4">
                {weg.einwaende.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">{t("keineEinwaende")}</p>
                ) : (
                  weg.einwaende.map((e, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border/70 border-l-4 border-l-destructive bg-card/50 p-3.5"
                    >
                      <b className="mb-1 block text-sm text-destructive">„{e.einwand}"</b>
                      <p className="text-sm leading-relaxed">{e.antwort}</p>
                    </div>
                  ))
                )}
              </TabsContent>
              <TabsContent value="benefits" className="space-y-1 pt-4">
                {(() => {
                  const items = [
                    ...(weg.benefit ? weg.benefit.split("\n").filter(Boolean) : []),
                    ...project.benefits,
                  ];
                  return items.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">{t("keineBenefits")}</p>
                  ) : (
                    items.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 border-b border-border/50 py-2 text-sm last:border-0"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                        <span>{b}</span>
                      </div>
                    ))
                  );
                })()}
              </TabsContent>
              <TabsContent value="ziele" className="space-y-1 pt-4">
                {(() => {
                  const items = [
                    ...(weg.ziele ? weg.ziele.split("\n").filter(Boolean) : []),
                    ...project.ziele,
                  ];
                  return items.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">{t("keineZiele")}</p>
                  ) : (
                    items.map((z, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 border-b border-border/50 py-2 text-sm last:border-0"
                      >
                        <Target className="mt-0.5 size-4 shrink-0 text-warning" />
                        <span>{z}</span>
                      </div>
                    ))
                  );
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {project.sfInput && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4">
          <b className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-success">
            {t("sfInput")}
          </b>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {project.sfInput}
          </pre>
        </div>
      )}

      {allFiles.length > 0 && (
        <Card>
          <CardContent className="space-y-1.5 pt-5">
            <h2 className="mb-2 text-base font-semibold">{t("unterlagen")}</h2>
            <FileList files={allFiles} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SalesCockpitHomePage() {
  const t = useTranslations("SalesCockpit");
  const projects = useQuery(api.salesCockpit.listProjects);
  const [activeProjectId, setActiveProjectId] = useState<Id<"salesCockpitProjects"> | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const activeProject = useMemo(
    () => projects?.find((p) => p._id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  return (
    <div>
      <div className="mb-6 flex gap-2.5">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setSearchQuery(searchInput.trim());
          }}
          placeholder={t("lexSearchPlaceholder")}
          className="h-11"
        />
        <Button onClick={() => setSearchQuery(searchInput.trim())} className="h-11">
          <Search />
          {t("suchen")}
        </Button>
      </div>

      {searchQuery && (
        <LexikonSearchResults
          query={searchQuery}
          onClose={() => {
            setSearchQuery("");
            setSearchInput("");
          }}
        />
      )}

      <h2 className="mb-3 mt-1 text-base font-semibold">{t("welchesProjekt")}</h2>
      {projects === undefined ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : projects.length === 0 ? (
        <EmptyState icon={<PhoneCall />} title={t("keineProjekte")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => setActiveProjectId(p._id)}
              className={cn(
                "relative rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                p._id === activeProjectId
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border",
              )}
            >
              <PhoneCall className="absolute right-3.5 top-3.5 size-4 text-primary" />
              <b className="block pr-6 text-sm">{p.titel}</b>
              <small className="font-mono text-xs text-muted-foreground">
                {t("start")}: {p.start || "–"} · {p.wege.length} {t("wege")}
              </small>
            </button>
          ))}
        </div>
      )}

      {activeProject && <Cockpit project={activeProject} />}
    </div>
  );
}
