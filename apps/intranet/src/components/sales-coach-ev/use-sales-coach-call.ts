"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useErrorHandler } from "@/hooks/use-error-handler";
import { useIntranetApiClient } from "@/lib/api-client";
import { useEdenApi } from "@/lib/eden";
import { startCallReport } from "@/lib/sales-coach-ev-api";

import { OBJECTIONS } from "./constants";
import { type Hint, type Outcome } from "./types";

// The Web Speech API has no official TS lib entry — this is the minimal
// surface this hook actually uses, backed by Chrome/Edge's implementation.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LIVE_ANALYSIS_INTERVAL_MS = 35_000;
const MIN_SCORED_DURATION_SEC = 60;

function detectObjection(tailText: string): string | null {
  const lower = tailText.toLowerCase();
  const hit = OBJECTIONS.find((o) => o.trigger.some((kw) => lower.includes(kw.toLowerCase())));
  return hit?.id ?? null;
}

export function useSalesCoachCall() {
  const t = useTranslations("SalesCoachEv");
  const eden = useEdenApi();
  const apiClient = useIntranetApiClient();
  const handleError = useErrorHandler();

  const [status, setStatus] = useState<"idle" | "live" | "stopped">("idle");
  const [thinking, setThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [hints, setHints] = useState<Hint[]>([]);
  const [evChecks, setEvChecks] = useState([false, false, false, false, false]);
  const [detectedPath, setDetectedPath] = useState(0);
  const [detectedObjectionId, setDetectedObjectionId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The call just saved — its report runs on its own, see CallView. */
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const runningRef = useRef(false);
  const callStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callerMsRef = useRef(0);
  const totalMsRef = useRef(0);
  const lastAnalysisLenRef = useRef(0);
  const transcriptRef = useRef("");

  const browserSupported = getSpeechRecognitionCtor() !== null;

  const runLiveAnalysis = useCallback(async () => {
    const text = transcriptRef.current.trim();
    if (!text || text.length < 80 || text.length - lastAnalysisLenRef.current < 60) return;
    lastAnalysisLenRef.current = text.length;
    setThinking(true);
    try {
      const elapsed = callStartRef.current
        ? Math.floor((Date.now() - callStartRef.current) / 1000)
        : 0;
      const { data, error: apiError } = await eden["sales-coach-ev"]["live-hint"].post({
        transcriptTail: text.slice(-1800),
        elapsedSec: elapsed,
      });
      if (apiError) throw apiError;
      if (data.hints.length) {
        const time = elapsed
          ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
          : "00:00";
        setHints((prev) => [
          ...data.hints.map((h) => ({
            type: h.type as Hint["type"],
            tag: h.tag,
            text: h.text,
            time,
          })),
          ...prev,
        ]);
      }
      if (data.evChecks.length === 5) setEvChecks(data.evChecks);
      if (data.detectedPath) setDetectedPath(data.detectedPath);
    } catch (err) {
      console.error("[sales-coach-ev] live analysis failed:", err);
    } finally {
      setThinking(false);
    }
  }, [eden]);

  const updateTimer = useCallback(() => {
    if (!callStartRef.current) return;
    const sec = Math.floor((Date.now() - callStartRef.current) / 1000);
    totalMsRef.current = Date.now() - callStartRef.current;
    setElapsedSec(sec);
  }, []);

  /** Saves the call, then hands scoring to a run — the report finishes and
   * attaches to the call whether or not this page is still open. */
  const saveAndAnalyzeCall = useCallback(async () => {
    const finalTranscript = transcriptRef.current;
    const durationSec = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0;
    const callerSpeakPct =
      totalMsRef.current > 0 ? Math.round((callerMsRef.current / totalMsRef.current) * 100) : 0;
    const finalOutcome = outcome ?? "kein_ergebnis";
    setSaving(true);
    try {
      const { data: created, error: createError } = await eden["sales-coach-ev"].calls.post({
        transcript: finalTranscript,
        durationSec,
        callerSpeakPct,
        outcome: finalOutcome,
      });
      if (createError) throw createError;
      setLastCallId(created.id);

      if (durationSec < MIN_SCORED_DURATION_SEC) {
        toast.info(t("reportSavedShort"));
        return;
      }
      await startCallReport(apiClient, {
        callId: created.id,
        transcript: finalTranscript,
        durationSec,
        callerSpeakPct,
        outcome: finalOutcome,
      });
    } catch (err) {
      handleError(err, t("reportStartFailed"));
    } finally {
      setSaving(false);
    }
  }, [eden, apiClient, outcome, handleError, t]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (analysisRef.current) clearInterval(analysisRef.current);
    timerRef.current = null;
    analysisRef.current = null;
    setStatus("stopped");
    if (transcriptRef.current.trim().length > 50) {
      void saveAndAnalyzeCall();
    }
  }, [saveAndAnalyzeCall]);

  const start = useCallback(
    (lang: string) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError(t("speechUnsupported"));
        return;
      }
      setError(null);
      setTranscript("");
      setInterim("");
      transcriptRef.current = "";
      setHints([]);
      setEvChecks([false, false, false, false, false]);
      setDetectedPath(0);
      setDetectedObjectionId(null);
      setOutcome(null);
      setLastCallId(null);
      setElapsedSec(0);
      callerMsRef.current = 0;
      totalMsRef.current = 0;
      lastAnalysisLenRef.current = 0;
      callStartRef.current = null;

      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        runningRef.current = true;
        callStartRef.current = callStartRef.current ?? Date.now();
        setStatus("live");
        timerRef.current = timerRef.current ?? setInterval(updateTimer, 1000);
        analysisRef.current =
          analysisRef.current ?? setInterval(runLiveAnalysis, LIVE_ANALYSIS_INTERVAL_MS);
      };
      recognition.onresult = (e) => {
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const chunk = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            transcriptRef.current += `${chunk} `;
            callerMsRef.current += chunk.split(/\s+/).length * 350;
            setTranscript(transcriptRef.current);
          } else {
            interimText += chunk;
          }
        }
        setInterim(interimText);
        const objection = detectObjection(transcriptRef.current.slice(-400));
        if (objection) setDetectedObjectionId(objection);
      };
      recognition.onerror = (e) => {
        const messages: Record<string, string> = {
          "not-allowed": t("speechMicDenied"),
          "no-speech": t("speechNoSound"),
          network: t("speechNetwork"),
          "audio-capture": t("speechNoMic"),
        };
        const msg = messages[e.error];
        if (msg) {
          setError(msg);
          stop();
        }
      };
      recognition.onend = () => {
        if (runningRef.current) {
          try {
            recognition.start();
          } catch {
            // already starting — ignore, matches original's swallow-and-retry
          }
        } else {
          setStatus("stopped");
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (err) {
        console.error("[sales-coach] speech recognition failed to start", err);
        setError(t("speechStartFailed"));
      }
    },
    [runLiveAnalysis, stop, t, updateTimer],
  );

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (analysisRef.current) clearInterval(analysisRef.current);
    };
  }, []);

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  return {
    status,
    thinking,
    saving,
    transcript,
    interim,
    elapsedSec,
    hints,
    evChecks,
    detectedPath,
    detectedObjectionId,
    outcome,
    setOutcome,
    error,
    lastCallId,
    wordCount,
    browserSupported,
    start,
    stop,
  };
}
