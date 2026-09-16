"use client";

import { useCallback, useState } from "react";

import { useRouter } from "next/navigation";

import { useIntranetApiClient } from "@/lib/api-client";

const POLL_MS = 350;
const TIMEOUT_MS = 20_000;

interface NavigateOutput {
  href: string | null;
  label: string | null;
}

/**
 * One-shot "resolve this sentence to a page and go there" — used by both the
 * dashboard helper card and the command palette's fallback search. Polls
 * `/ai/runs/:id` directly rather than a live Convex subscription, since
 * nothing here needs to stay mounted once the answer comes back.
 */
export function useAiNavigate() {
  const apiClient = useIntranetApiClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = useCallback(
    async (query: string) => {
      const question = query.trim();
      if (!question) return;
      setPending(true);
      setNotFound(false);
      setFailed(false);
      try {
        const { runId } = await apiClient.fetchJson<{ runId: string }>("/ai/navigate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: question }),
        });

        const startedAt = Date.now();
        let status = "running";
        let output: string | null = null;
        while (status === "running" && Date.now() - startedAt < TIMEOUT_MS) {
          const res = await apiClient.fetchJson<{ status: string; output: string | null }>(
            `/ai/runs/${runId}`,
          );
          status = res.status;
          output = res.output;
          if (status === "running") await new Promise((r) => setTimeout(r, POLL_MS));
        }

        if (status !== "done" || !output) {
          setFailed(true);
          return;
        }
        const result = JSON.parse(output) as NavigateOutput;
        if (result.href) {
          router.push(result.href);
        } else {
          setNotFound(true);
        }
      } catch {
        setFailed(true);
      } finally {
        setPending(false);
      }
    },
    [apiClient, router],
  );

  return { run, pending, notFound, failed };
}
