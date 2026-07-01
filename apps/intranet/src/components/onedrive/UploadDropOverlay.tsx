"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Rocket, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";

type Phase = "idle" | "prompt" | "uploading" | "success";

interface Props {
  /** Whether files may be dropped here (write or request access). */
  enabled: boolean;
  /** Employee path → drops become approval requests; copy reflects that. */
  requiresApproval: boolean;
  /** Perform the upload(s); report 0–1 progress for the rocket. */
  onUpload: (
    files: File[],
    onProgress: (fraction: number) => void
  ) => Promise<void>;
}

/**
 * Full-screen drag-and-drop surface. Dragging files from the desktop dims the
 * page (like the tour overlay) and shows a glowing blue "drop here" target;
 * dropping launches a rocket while the bytes upload, then a checkmark, then it
 * all fades away. Touch devices have no OS file-drag, so this stays dormant
 * there (the toolbar's Upload button covers mobile).
 */
export function UploadDropOverlay({
  enabled,
  requiresApproval,
  onUpload,
}: Props) {
  const t = useTranslations("Files");
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const dragDepth = useRef(0);

  const hasFiles = (e: DragEvent): boolean =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const runUpload = useCallback(
    async (files: File[]) => {
      setProgress(0);
      setPhase("uploading");
      try {
        await onUpload(files, setProgress);
        setProgress(1);
        setPhase("success");
        window.setTimeout(() => setPhase("idle"), 1600);
      } catch {
        // The caller surfaces the error toast; just retract the overlay.
        setPhase("idle");
      }
    },
    [onUpload]
  );

  useEffect(() => {
    if (!enabled) return;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setPhase(p => (p === "idle" ? "prompt" : p));
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setPhase(p => (p === "prompt" ? "idle" : p));
      }
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) void runUpload(files);
      else setPhase("idle");
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled, runUpload]);

  const visible = phase !== "idle";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          aria-live="polite"
        >
          {phase === "prompt" && (
            <motion.div
              className="flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/5 px-12 py-14 text-center"
              initial={{ scale: reduce ? 1 : 0.94, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                boxShadow: reduce
                  ? "0 0 0 0 rgba(59,130,246,0)"
                  : [
                      "0 0 24px 2px rgba(59,130,246,0.35)",
                      "0 0 52px 8px rgba(59,130,246,0.65)",
                      "0 0 24px 2px rgba(59,130,246,0.35)",
                    ],
              }}
              transition={{
                boxShadow: { duration: 1.6, repeat: Infinity },
                default: { duration: 0.25 },
              }}
            >
              <UploadCloud className="size-12 text-blue-400" />
              <div>
                <p className="text-xl font-semibold text-white">
                  {t("dropTitle")}
                </p>
                <p className="mt-1 text-sm text-blue-100/80">
                  {requiresApproval
                    ? t("dropSubtitleApproval")
                    : t("dropSubtitle")}
                </p>
              </div>
            </motion.div>
          )}

          {phase === "uploading" && (
            <div className="flex flex-col items-center gap-6">
              <div className="relative h-40 w-24 overflow-hidden">
                <motion.div
                  className="absolute inset-x-0 bottom-0 flex justify-center"
                  initial={{ y: 0 }}
                  animate={reduce ? { y: 0 } : { y: [-4, -120] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: "easeIn",
                  }}
                >
                  <Rocket className="size-12 -rotate-45 text-blue-400" />
                </motion.div>
              </div>
              <div className="w-56">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <motion.div
                    className="h-full rounded-full bg-blue-400"
                    animate={{ width: `${Math.round(progress * 100)}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
                <p className="mt-3 text-center text-sm text-blue-100/80">
                  {requiresApproval ? t("uploadingApproval") : t("uploading")}
                </p>
              </div>
            </div>
          )}

          {phase === "success" && (
            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ scale: reduce ? 1 : 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              <div className="flex size-20 items-center justify-center rounded-full bg-green-500/20">
                <Check className="size-12 text-green-400" strokeWidth={3} />
              </div>
              <p className="text-lg font-medium text-white">
                {requiresApproval ? t("doneApproval") : t("done")}
              </p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
