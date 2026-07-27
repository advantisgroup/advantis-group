"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Doc, type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Link2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useConfirm,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  chapterResultLabel,
  DLAB,
  parseProgress,
  recommendations,
} from "./progress";
import { ACADEMY_ID } from "./use-academy-progress";

import type { AcademyProgressData } from "./types";

function userDisplayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
}

export function TrainerView({
  focusParticipantId,
  focusQuestionId,
}: {
  focusParticipantId?: string | null;
  focusQuestionId?: string | null;
}) {
  const [tab, setTab] = useState<"teiln" | "fragen" | "set">(
    focusQuestionId ? "fragen" : "teiln"
  );

  return (
    <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
      <TabsList>
        <TabsTrigger value="teiln">Teilnehmer & Ergebnisse</TabsTrigger>
        <TabsTrigger value="fragen">Fragen</TabsTrigger>
        <TabsTrigger value="set">Einstellungen</TabsTrigger>
      </TabsList>
      <TabsContent value="teiln">
        <ParticipantsTab focusParticipantId={focusParticipantId} />
      </TabsContent>
      <TabsContent value="fragen">
        <QuestionsTab focusQuestionId={focusQuestionId} />
      </TabsContent>
      <TabsContent value="set">
        <SettingsTab />
      </TabsContent>
    </Tabs>
  );
}

// ─── Teilnehmer & Ergebnisse ───────────────────────────────────────────────

function sendMailtoInvite(name: string, email: string, code: string) {
  const body = `Hallo ${name},%0D%0A%0D%0Adu bist zur Wallbox Sales Academy eingeladen - unserem Onboarding-Training für den B2B-Vertrieb von Ladeinfrastruktur.%0D%0A%0D%0ASo startest du:%0D%0A1. Öffne im Intranet Guidebooks -> Wallbox Sales Academy%0D%0A2. Klicke auf "Ich bin Teilnehmer"%0D%0A3. Dein persönlicher Zugangscode: ${code}%0D%0A%0D%0ADas Training umfasst mehrere Kapitel inkl. Wissens-Checks, Rechercheaufgaben und Call-Simulator. Deine Fragen kannst du direkt in der App stellen.%0D%0A%0D%0AViel Erfolg!`;
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Einladung: Wallbox Sales Academy - dein Zugangscode")}&body=${body}`;
  window.open(mailto, "_self");
  void navigator.clipboard
    ?.writeText(`Zugangscode für ${name}: ${code}`)
    .catch(() => {});
  toast.success(
    `Zugangscode für ${name} kopiert (${code}). Mailprogramm wurde geöffnet.`
  );
}

function CreateParticipantDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"email" | "account">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const users = useQuery(api.users.list, {});
  const create = useMutation(api.academyParticipants.create);

  const matchedUser =
    mode === "email" && email.trim()
      ? (users ?? []).find(
          u => u.email.toLowerCase() === email.trim().toLowerCase()
        )
      : null;

  function reset() {
    setMode("email");
    setName("");
    setEmail("");
    setSelectedUserId(undefined);
  }

  async function submit() {
    if (mode === "account") {
      if (!selectedUserId) return;
      await create({
        academyId: ACADEMY_ID,
        name: "",
        email: "",
        linkUserId: selectedUserId as Id<"users">,
      });
      toast.success(
        "Einladung gesendet - Benachrichtigung und E-Mail wurden verschickt."
      );
    } else {
      if (!name.trim() || !email.trim()) return;
      const result = await create({ academyId: ACADEMY_ID, name, email });
      sendMailtoInvite(name, email, result.code);
    }
    setOpen(false);
    reset();
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Teilnehmer anlegen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Teilnehmer anlegen</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={mode === "email" ? "default" : "outline"}
            onClick={() => setMode("email")}
          >
            Per E-Mail
          </Button>
          <Button
            size="sm"
            variant={mode === "account" ? "default" : "outline"}
            onClick={() => setMode("account")}
          >
            Über Intranet-Konto
          </Button>
        </div>

        {mode === "email" ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="nn">Name</Label>
              <Input
                id="nn"
                className="mt-1"
                placeholder="Vorname Nachname"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ne">E-Mail</Label>
              <Input
                id="ne"
                type="email"
                className="mt-1"
                placeholder="name@firma.de"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            {matchedUser ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span>
                  Diese E-Mail gehört zum Intranet-Konto{" "}
                  <b>{userDisplayName(matchedUser)}</b>.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedUserId(matchedUser._id);
                    setMode("account");
                  }}
                >
                  Stattdessen darüber einladen
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Die App versendet die E-Mail nicht selbst: Der Button öffnet dein
              Mailprogramm mit fertigem Text (Zugangscode + Link), den du
              absendest.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Label>Intranet-Konto</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Konto auswählen" />
              </SelectTrigger>
              <SelectContent>
                {(users ?? []).map(u => (
                  <SelectItem key={u._id} value={u._id}>
                    {userDisplayName(u)} · {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Der Zugangscode geht sofort als In-App-Benachrichtigung und als
              E-Mail an dieses Konto. Zugriff auf die Academy läuft weiterhin
              über den Code, nicht automatisch über das Konto.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              mode === "email" ? !name.trim() || !email.trim() : !selectedUserId
            }
          >
            Anlegen & Einladung erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantsTab({
  focusParticipantId,
}: {
  focusParticipantId?: string | null;
}) {
  const participants = useQuery(api.academyParticipants.listAll, {
    academyId: ACADEMY_ID,
  });
  const results = useQuery(api.academyResults.listAll, {
    academyId: ACADEMY_ID,
  });
  const remove = useMutation(api.academyParticipants.remove);
  const confirm = useConfirm();
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(
    focusParticipantId ?? null
  );
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (focusParticipantId && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusParticipantId]);

  if (participants === undefined || results === undefined) {
    return <p className="text-sm text-muted-foreground">Lade Teilnehmer …</p>;
  }

  const resultsByParticipant = new Map(results.map(r => [r.participantId, r]));

  function copyParticipantLink(participantId: string) {
    const url = `${window.location.origin}${pathname}?participant=${encodeURIComponent(participantId)}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link kopiert");
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Teilnehmer ({participants.length})</h3>
          <CreateParticipantDialog onCreated={() => undefined} />
        </div>

        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Teilnehmer angelegt.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Wissens-Check</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map(p => {
                const resultRow = resultsByParticipant.get(p._id);
                const progress = parseProgress(resultRow?.data);
                const quiz = CHAPTERS.filter(c => c.quiz).reduce(
                  (acc, c) => {
                    const state = progress.chapters[c.id];
                    return {
                      correct: acc.correct + (state?.correct ?? 0),
                      total: acc.total + (state?.total ?? 0),
                    };
                  },
                  { correct: 0, total: 0 }
                );
                const status = progress.finished
                  ? "abgeschlossen"
                  : progress.started
                    ? "in Bearbeitung"
                    : "eingeladen";
                const open = openId === p._id;
                return (
                  <Fragment key={p._id}>
                    <TableRow
                      ref={
                        open && focusParticipantId === p._id
                          ? rowRef
                          : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{p.name}</span>
                          {p.linkedUserId ? (
                            <Badge variant="secondary">verknüpft</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{p.code}</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={progress.finished ? "success" : "secondary"}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {quiz.total
                          ? `${quiz.correct}/${quiz.total} (${Math.round((quiz.correct / quiz.total) * 100)} %)`
                          : "–"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Link kopieren"
                            onClick={() => copyParticipantLink(p._id)}
                          >
                            <Link2 className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              sendMailtoInvite(p.name, p.email, p.code)
                            }
                          >
                            Einladung
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenId(open ? null : p._id)}
                          >
                            {open ? "Schließen" : "Details"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Teilnehmer löschen?",
                                description: `${p.name} samt Ergebnissen und Fragen wird endgültig gelöscht.`,
                                confirmLabel: "Löschen",
                              });
                              if (ok) await remove({ participantId: p._id });
                            }}
                          >
                            Löschen
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <ParticipantDetail
                            participant={p}
                            progress={progress}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LinkAccountControl({
  participant,
}: {
  participant: Doc<"academyParticipants">;
}) {
  const users = useQuery(api.users.list, {});
  const linkToAccount = useMutation(api.academyParticipants.linkToAccount);
  const unlinkAccount = useMutation(api.academyParticipants.unlinkAccount);

  return (
    <Select
      value={participant.linkedUserId ?? "none"}
      onValueChange={v => {
        if (v === "none")
          void unlinkAccount({ participantId: participant._id });
        else
          void linkToAccount({
            participantId: participant._id,
            userId: v as Id<"users">,
          });
      }}
    >
      <SelectTrigger className="w-72">
        <SelectValue placeholder="Kein Konto verknüpft" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Kein Konto verknüpft</SelectItem>
        {(users ?? []).map(u => (
          <SelectItem key={u._id} value={u._id}>
            {userDisplayName(u)} · {u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ParticipantDetail({
  participant,
  progress,
}: {
  participant: Doc<"academyParticipants">;
  progress: AcademyProgressData;
}) {
  const rec = recommendations(progress);

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-muted-foreground">
        Gestartet: {progress.started ?? "–"} · Abgeschlossen:{" "}
        {progress.finished ?? "–"}
      </p>

      {progress.finished ? (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">
            Mit Intranet-Konto verknüpfen
          </h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Verknüpft die abgeschlossenen Ergebnisse mit einem echten
            Intranet-Konto, z. B. für die Personalakte.
          </p>
          <LinkAccountControl participant={participant} />
        </div>
      ) : null}

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
        <h4 className="mb-1.5 text-sm font-semibold">
          Call-Simulator (Warm Leads)
        </h4>
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
            const missing = s.targets
              .filter(t => !d.data.includes(t))
              .map(t => DLAB[t]);
            return (
              <p key={s.id} className="text-sm">
                <Badge variant={d.score / d.max >= 0.7 ? "success" : "warning"}>
                  {d.score}/{d.max} Pkt.
                </Badge>{" "}
                {s.title} <Badge variant="secondary">{s.combo}</Badge>
                <br />
                <span className="text-xs text-muted-foreground">
                  Datenerfassung {d.data.length}/{s.targets.length}
                  {missing.length
                    ? ` - fehlend: ${missing.join(", ")}`
                    : " - vollständig"}{" "}
                  · Versuch(e): {d.attempts ?? 1} · {d.date}
                </span>
              </p>
            );
          })}
        </div>
      </div>

      {Object.keys(progress.research).some(k =>
        progress.research[k]?.trim()
      ) ? (
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

// ─── Fragen ──────────────────────────────────────────────────────────────

function QuestionsTab({
  focusQuestionId,
}: {
  focusQuestionId?: string | null;
}) {
  const questions = useQuery(api.academyQuestions.listAll, {
    academyId: ACADEMY_ID,
  });
  const answer = useMutation(api.academyQuestions.answer);
  const reopen = useMutation(api.academyQuestions.reopen);
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!focusQuestionId || !questions) return;
    document
      .getElementById(`admin-q-${focusQuestionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusQuestionId, questions]);

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

  function copyQuestionLink(chapterId: string, questionId: string) {
    const url = `${window.location.origin}${pathname}?ch=${encodeURIComponent(chapterId)}&q=${encodeURIComponent(questionId)}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link kopiert");
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h3 className="font-semibold">
          Fragen der Teilnehmer ({questions.length})
        </h3>
        {questions.map(q => (
          <div
            key={q._id}
            id={`admin-q-${q._id}`}
            className={
              "rounded-lg border p-3.5 " +
              (focusQuestionId === q._id
                ? "border-primary ring-2 ring-primary"
                : "border-border")
            }
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={q.answered ? "success" : "warning"}>
                {q.answered ? "beantwortet" : "offen"}
              </Badge>
              <b>{q.participantName}</b>
              <span className="text-xs text-muted-foreground">
                · {q.chapterTitle} ·{" "}
                {new Date(q.createdAt).toLocaleDateString("de-DE")}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                className="ml-auto"
                aria-label="Link kopieren"
                onClick={() => copyQuestionLink(q.chapterId, q._id)}
              >
                <Link2 className="size-3.5" />
              </Button>
            </div>
            <p className="my-2 text-sm">{q.text}</p>
            <Label className="mb-1 block text-xs font-medium text-muted-foreground">
              Antwort (für den Teilnehmer sichtbar)
            </Label>
            <Textarea
              value={drafts[q._id] ?? q.answer ?? ""}
              onChange={e =>
                setDrafts(d => ({ ...d, [q._id]: e.target.value }))
              }
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void answer({
                    questionId: q._id,
                    answer: drafts[q._id] ?? q.answer ?? "",
                  })
                }
              >
                Antwort speichern
              </Button>
              {q.answered ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void reopen({ questionId: q._id })}
                >
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

// ─── Einstellungen ─────────────────────────────────────────────────────────

function SettingsTab() {
  const setPinMutation = useMutation(api.academySettings.setPin);
  const resetAll = useMutation(api.academySettings.resetAll);
  const confirm = useConfirm();
  const [pin, setPinValue] = useState("");
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 font-semibold">Einstellungen</h3>
          <Label htmlFor="np">Admin-PIN ändern</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="np"
              type="password"
              className="max-w-[200px]"
              placeholder="Neue PIN"
              value={pin}
              onChange={e => {
                setPinValue(e.target.value);
                setSaved(false);
              }}
            />
            <Button
              onClick={async () => {
                if (pin.trim().length < 4) {
                  toast.error("PIN mit mindestens 4 Zeichen wählen.");
                  return;
                }
                await setPinMutation({ academyId: ACADEMY_ID, pin });
                setSaved(true);
              }}
            >
              Speichern
            </Button>
            {saved ? (
              <span className="text-xs text-muted-foreground">
                Gespeichert.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-2 font-semibold">Daten</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Löscht alle Teilnehmer, Ergebnisse, Fragen und die PIN dieser
            Academy unwiderruflich.
          </p>
          <Button
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: "Wirklich alle Daten zurücksetzen?",
                description:
                  "Alle Teilnehmer, Ergebnisse und Fragen werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.",
                confirmLabel: "Alles löschen",
              });
              if (ok) {
                await resetAll({ academyId: ACADEMY_ID });
                toast.success("Alle Daten wurden zurückgesetzt.");
              }
            }}
          >
            Alle Daten zurücksetzen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
