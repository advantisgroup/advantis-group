"use client";

import { useCallback, useMemo } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useMutation, useQuery } from "convex/react";

import { CHAPTERS } from "./data";
import { isChapterDone, parseProgress, today } from "./progress";

import type { AcademyProgressData } from "./types";

export const ACADEMY_ID = "wallbox-sales";

export function useAcademyProgress(participantId: Id<"academyParticipants">) {
  const remote = useQuery(api.academyResults.getMine, { participantId });
  const save = useMutation(api.academyResults.saveMine);

  const loading = remote === undefined;
  const progress = useMemo(() => parseProgress(remote?.data ?? null), [remote]);

  const mutate = useCallback(
    async (fn: (current: AcademyProgressData) => AcademyProgressData) => {
      let next = fn(progress);
      const allDone = CHAPTERS.every(chapter => isChapterDone(next, chapter));
      if (allDone && !next.finished) {
        next = { ...next, finished: today() };
      }
      await save({
        academyId: ACADEMY_ID,
        participantId,
        data: JSON.stringify(next),
      });
    },
    [progress, save, participantId]
  );

  return { progress, loading, mutate };
}
