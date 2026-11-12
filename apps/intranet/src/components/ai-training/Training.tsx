"use client";

import { useEffect, useRef, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileText, Loader2, MessagesSquare, Paperclip, Plus, Send, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AiDots } from "@/components/ai/AiGlyph";
import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiRun } from "@/components/ai/use-ai-run";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ProposalCard } from "./Proposals";
import { TRAINING_FILE_ACCEPT, type TrainingFile, useAiTrainingApi } from "./shared";

export function Training() {
  const t = useTranslations("AiTraining.training");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessions = useQuery(api.aiTraining.sessions.list);
  const createSession = useMutation(api.aiTraining.sessions.create);
  const selected =
    (searchParams.get("s") as Id<"aiTrainingSessions"> | null) ?? sessions?.[0]?._id ?? null;

  async function start() {
    const id = await createSession({});
    router.push(`${pathname}?s=${id}`);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        <Button className="w-full" onClick={() => void start()}>
          <Plus />
          {t("new")}
        </Button>
        {sessions === undefined ? (
          <Skeleton className="h-32" />
        ) : (
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {sessions.map((s) => (
              <li key={s._id}>
                <button
                  type="button"
                  onClick={() => router.push(`${pathname}?s=${s._id}`)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted",
                    s._id === selected && "bg-muted font-medium",
                  )}
                >
                  <span className="line-clamp-2">{s.title}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {s.createdByName} · {formatDateTime(s.updatedAt, locale)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {selected ? (
        <Session key={selected} sessionId={selected} />
      ) : (
        <EmptyState
          icon={<MessagesSquare />}
          title={t("emptyTitle")}
          description={t("emptyHint")}
          action={
            <Button onClick={() => void start()}>
              <Plus />
              {t("new")}
            </Button>
          }
        />
      )}
    </div>
  );
}

function Session({ sessionId }: { sessionId: Id<"aiTrainingSessions"> }) {
  const t = useTranslations("AiTraining.training");
  const locale = useLocale();
  const session = useQuery(api.aiTraining.sessions.get, { sessionId });
  const proposals = useQuery(api.aiTraining.proposals.bySession, { sessionId }) ?? [];
  const trainingApi = useAiTrainingApi();
  const view = useAiRun({ subjectKey: `aiTraining:${sessionId}` });
  const [text, setText] = useState("");
  const [files, setFiles] = useState<TrainingFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const working = view.state === "working";

  const messageCount = session?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messageCount, view.text]);

  if (session === undefined) return <Skeleton className="h-96" />;
  if (session === null) return <EmptyState icon={<MessagesSquare />} title={t("gone")} />;

  // The answer is stored once the run ends; until then it streams from the run.
  const lastIsQuestion = session.messages.at(-1)?.role === "user";
  const byRun = new Map<string, typeof proposals>();
  const unassigned: typeof proposals = [];
  const answerTimes = session.messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.createdAt);
  for (const p of proposals) {
    const at = answerTimes.find((time) => time >= p.createdAt);
    const answer = session.messages.find((m) => m.role === "assistant" && m.createdAt === at);
    if (answer) byRun.set(answer._id, [...(byRun.get(answer._id) ?? []), p]);
    else unassigned.push(p);
  }

  async function pick(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      setUploading((n) => n + 1);
      try {
        const uploaded = await trainingApi.upload(file);
        setFiles((prev) => [...prev, uploaded].slice(0, 5));
      } catch {
        toast.error(t("uploadFailed", { name: file.name }));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function send() {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      await trainingApi.send(sessionId, text.trim(), files);
      setText("");
      setFiles([]);
    } catch {
      toast.error(t("sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-[60vh] flex-col rounded-xl border">
      <header className="border-b px-4 py-3">
        <h2 className="font-medium">{session.title}</h2>
        {session.gap && (
          <p className="mt-1 text-sm text-muted-foreground">
            <Badge variant="muted" className="mr-2">
              {t("gap")}
            </Badge>
            {session.gap.question}
            {session.gap.detail && ` — ${session.gap.detail}`}
          </p>
        )}
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {session.messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {session.gap ? t("startGap") : t("start")}
          </p>
        )}
        {session.messages.map((m) =>
          m.role === "user" ? (
            <div key={m._id} className="ml-auto max-w-[85%] space-y-1">
              <div className="rounded-2xl bg-muted px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                {m.content}
                {m.files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.files.map((f) => (
                      <a
                        key={f.storageId}
                        href={f.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs"
                      >
                        <FileText className="size-3" />
                        {f.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-right text-xs text-muted-foreground">
                {m.authorName} · {formatDateTime(m.createdAt, locale)}
              </p>
            </div>
          ) : (
            <div key={m._id} className="space-y-3">
              <div className="text-[15px] leading-7">
                <AiMarkdown>{m.content}</AiMarkdown>
              </div>
              {(byRun.get(m._id) ?? []).map((p) => (
                <ProposalCard key={p._id} proposal={p} />
              ))}
            </div>
          ),
        )}
        {lastIsQuestion && (working || sending) && (
          <div className="space-y-2">
            {view.text ? (
              <div className="text-[15px] leading-7">
                <AiMarkdown>{view.text}</AiMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <AiDots />
                <AiThinking phase={view.run?.phase} elapsedSec={view.elapsedSec} />
              </div>
            )}
          </div>
        )}
        {lastIsQuestion &&
          !working &&
          !sending &&
          view.state &&
          view.state !== "done" &&
          (view.run?.startedAt ?? 0) >= (session.messages.at(-1)?.createdAt ?? 0) && (
            <p className="text-sm text-destructive">{t("failed")}</p>
          )}
        {unassigned.map((p) => (
          <ProposalCard key={p._id} proposal={p} />
        ))}
        <div ref={bottom} />
      </div>
      <footer className="space-y-2 border-t p-3">
        {(files.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <span
                key={f.storageId}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
              >
                <FileText className="size-3" />
                {f.name}
                <button
                  type="button"
                  aria-label={t("removeFile")}
                  onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {uploading > 0 && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          className="min-h-[90px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={TRAINING_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void pick(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={files.length >= 5}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip />
              {t("attach")}
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t("attachHint")}
            </span>
          </div>
          <Button
            size="sm"
            disabled={working || sending || uploading > 0 || (!text.trim() && files.length === 0)}
            onClick={() => void send()}
          >
            <Send />
            {t("send")}
          </Button>
        </div>
      </footer>
    </section>
  );
}
