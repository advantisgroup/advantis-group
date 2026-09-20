"use client";

import { useMemo } from "react";

import { api } from "@advantis/convex/api";
import { useQuery } from "convex/react";

import { CHAPTERS, SEG } from "./data";
import { ACADEMY_ID } from "./use-academy-progress";

import type { Chapter, ChapterBlock, SegmentKey } from "./types";

/**
 * Where the course text comes from. Once an admin has run the one-time
 * migration (Admin → Einstellungen) that's the database, and editing a chapter
 * or a wrong answer no longer needs a deploy. Until then it's the bundled
 * `data.ts`, which is also the seed the migration copies in — so this reads
 * identically on both sides of the switch.
 */
export function useAcademyContent(): {
  chapters: Chapter[];
  segments: Record<string, string>;
  migrated: boolean;
  loading: boolean;
} {
  const content = useQuery(api.academy.content.list, { academyId: ACADEMY_ID });

  return useMemo(() => {
    if (!content?.migrated) {
      return {
        chapters: CHAPTERS,
        segments: SEG,
        migrated: false,
        loading: content === undefined,
      };
    }
    return {
      chapters: content.chapters.map((chapter) => ({
        id: chapter.chapterId,
        title: chapter.title,
        segment: chapter.segment as SegmentKey,
        body: parseJson<ChapterBlock[]>(chapter.body, []),
        quiz: chapter.quiz.length
          ? chapter.quiz.map((question) => ({
              id: question.questionId,
              question: question.question,
              options: question.options,
              correctIndex: question.correctIndex,
            }))
          : undefined,
        research: chapter.research || undefined,
        sim: chapter.sim || undefined,
        glossary: chapter.glossary
          ? parseJson<[string, string][]>(chapter.glossary, [])
          : undefined,
      })),
      segments: Object.fromEntries(content.segments.map((s) => [s.key, s.label])),
      migrated: true,
      loading: false,
    };
  }, [content]);
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
