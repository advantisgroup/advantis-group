"use client";

import { Fragment, useState } from "react";

import { api } from "@advantis/convex/api";
import { useMutation, useQuery } from "convex/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { CHAPTERS, SCENARIOS, SEG } from "./data";
import { chapterResultLabel, DLAB, parseProgress, recommendations } from "./progress";
import { ACADEMY_ID } from "./use-academy-progress";

import type { AcademyProgressData } from "./types";

export function TrainerView() {
  return (
    <Tabs defaultValue="participants">
      <TabsList>
        <TabsTrigger value="participants">Teilnehmer & Ergebnisse</TabsTrigger>
        <TabsTrigger value="questions">Fragen</TabsTrigger>
      </TabsList>
      <TabsContent value="participants">
        <ParticipantsTab />
      </TabsContent>
      <TabsContent value="questions">
        <QuestionsTab />
      </TabsContent>
    </Tabs>
  );
}

function ParticipantsTab() {
  const rows = useQuery(api.academyProgress.listAll, { academyId: ACADEMY_ID });
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  if (rows === undefined) {
    return <p className="text-sm text-muted-foreground">Lade Teilnehmer …</p>;
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Noch keine Teilnehmer haben mit der Academy begonnen.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 font-semibold">Teilnehmer ({rows.length})</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Wissens-Check</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const progress = parseProgress(row.data);
              const quiz = CHAPTERS.filter(c => c.quiz).reduce(
                (acc, c) => {
                  const state = progress.chapters[c.id];
                  const total = state?.total ?? 0;
                  const correct = state?.correct ?? 0;
                  return { correct: acc.correct + correct, total: acc.total + total };
                },
                { correct: 0, total: 0 }
              );
              const status = progress.finished
                ? "abgeschlossen"
                : progress.started
                  ? "in Bearbeitung"
                  : "eingeladen";
              const open = openUserId === row.userId;
              return (
                <Fragment key={row.userId}>
                  <TableRow>
                    <TableCell>
                      <div className="font-medium">{row.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={progress.finished ? "success" : "secondary"}>
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {quiz.total
                        ? `${quiz.correct}/${quiz.total} (${Math.round((quiz.correct / quiz.total) * 100)} %)`
                        : "–"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenUserId(open ? null : row.userId)}
                      >
                        {open ? "Schließen" : "Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open ? (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/30">
                        <ParticipantDetail progress={progress} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ParticipantDetail({ progress }: { progress: AcademyProgressData }) {
  const rec = recommendations(progress);

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-muted-foreground">
        Gestartet: {progress.started ?? "–"} · Abgeschlossen: {progress.finished ?? "–"}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kapitel</TableHead>
            <TableHead>Segment</TableHead>
            <TableHead>Ergebnis</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {CHAPTERS.map((chapter, i) => (
            <TableRow key={chapter.id}>
              <TableCell className="text-sm">
                {i + 1}. {chapter.title}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{SEG[chapter.segment]}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {chapterResultLabel(progress, chapter)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold">
          Empfehlung weiterer Schulungsbedarf
        </h4>
        {rec.length ? (
          <div className="space-y-1">
            {rec.map((r, i) => (
              <p key={i} className="text-sm">
                <Badge variant={r.level === "err" ? "destructive" : "warning"}>
                  {r.segmentLabel}
                </Badge>{" "}
                <span className="text-muted-foreground">{r.reason}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm">
            <Badge variant="success">Kein zusätzlicher Bedarf</Badge>{" "}
            <span className="text-muted-foreground">
              Alle Segmente über 70 % und Recherche vollständig.
            </span>
          </p>
        )}
      </div>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold">Call-Simulator (Warm Leads)</h4>
        <div className="space-y-1">
          {SCENARIOS.map(s => {
            const d = progress.calls[s.id];
            if (!d) {
              return (
                <p key={s.id} className="text-sm">
                  <Badge variant="destructive">offen</Badge> {s.title}{" "}
                  <Badge variant="secondary">{s.combo}</Badge>
                </p>
              );
            }
            const missing = s.targets.filter(t => !d.data.includes(t)).map(t => DLAB[t]);
            return (
              <p key={s.id} className="text-sm">
                <Badge variant={d.score / d.max >= 0.7 ? "success" : "warning"}>
                  {d.score}/{d.max} Pkt.
                </Badge>{" "}
                {s.title} <Badge variant="secondary">{s.combo}</Badge>
                <br />
                <span className="text-xs text-muted-foreground">
                  Datenerfassung {d.data.length}/{s.targets.length}
                  {missing.length ? ` - fehlend: ${missing.join(", ")}` : " - vollständig"} ·
                  Versuch(e): {d.attempts ?? 1} · {d.date}
                </span>
              </p>
            );
          })}
        </div>
      </div>

      {Object.keys(progress.research).some(k => progress.research[k]?.trim()) ? (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">Recherche-Antworten</h4>
          <div className="space-y-1.5">
            {Object.entries(progress.research)
              .filter(([, v]) => v.trim())
              .map(([k, v]) => (
                <div key={k} className="rounded-md bg-card p-2.5 text-sm">
                  <span className="text-xs text-muted-foreground">{k}</span>
                  <p className="mt-0.5">{v}</p>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuestionsTab() {
  const questions = useQuery(api.academyQuestions.listAll, { academyId: ACADEMY_ID });
  const answer = useMutation(api.academyQuestions.answer);
  const reopen = useMutation(api.academyQuestions.reopen);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (questions === undefined) {
    return <p className="text-sm text-muted-foreground">Lade Fragen …</p>;
  }
  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Noch keine Fragen von Teilnehmern.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h3 className="font-semibold">Fragen der Teilnehmer ({questions.length})</h3>
        {questions.map(q => (
          <div key={q._id} className="rounded-lg border border-border p-3.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={q.answered ? "success" : "warning"}>
                {q.answered ? "beantwortet" : "offen"}
              </Badge>
              <b>{q.participantName}</b>
              <span className="text-xs text-muted-foreground">
                · {q.chapterTitle} · {new Date(q.createdAt).toLocaleDateString("de-DE")}
              </span>
            </div>
            <p className="my-2 text-sm">{q.text}</p>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Antwort (für den Teilnehmer sichtbar)
            </label>
            <Textarea
              value={drafts[q._id] ?? q.answer ?? ""}
              onChange={e => setDrafts(d => ({ ...d, [q._id]: e.target.value }))}
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() => void answer({ questionId: q._id, answer: drafts[q._id] ?? q.answer ?? "" })}
              >
                Antwort speichern
              </Button>
              {q.answered ? (
                <Button size="sm" variant="ghost" onClick={() => void reopen({ questionId: q._id })}>
                  Wieder öffnen
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
