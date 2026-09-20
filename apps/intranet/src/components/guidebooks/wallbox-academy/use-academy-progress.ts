"use client";

import { useCallback, useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";

import { isChapterDone, now, parseProgress } from "./progress";

import type { AcademyProgressData, Chapter } from "./types";

export const ACADEMY_ID = "wallbox-sales";

/** `chapters` comes from `useAcademyContent` rather than the bundled file, so
 *  "finished the course" follows whatever chapters actually exist. */
export function useAcademyProgress(participantId: Id<"academyParticipants">, chapters: Chapter[]) {
  const remote = useQuery(api.academy.results.getMine, { participantId });
  const save = useMutation(api.academy.results.saveMine);

  const loading = remote === undefined;
  const progress = useMemo(() => parseProgress(remote?.data ?? null), [remote]);

  const mutate = useCallback(
    async (fn: (current: AcademyProgressData) => AcademyProgressData) => {
      let next = fn(progress);
      const allDone =
        chapters.length > 0 && chapters.every((chapter) => isChapterDone(next, chapter));
      if (allDone && !next.finished) {
        next = { ...next, finished: now() };
      }
      await save({
        academyId: ACADEMY_ID,
        participantId,
        data: JSON.stringify(next),
      });
    },
    [progress, save, participantId, chapters],
  );

  return { progress, loading, mutate };
}
