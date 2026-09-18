"use client";

import { useEffect, useState } from "react";

import { api } from "@advantis/convex/api";
import { type Id } from "@advantis/convex/dataModel";
import { useAction } from "convex/react";

export interface BlogPostAnalytics {
  configured: boolean;
  published: boolean;
  path: string;
  publicUrl: string;
  views: number;
  uniqueVisitors: number;
  avgTimeOnPageSeconds: number | null;
  bounceRate: number | null;
  referrers: { domain: string; visitors: number }[];
}

/**
 * Fetch-on-mount, not a live query - PostHog's Query API is comparatively
 * slow and rate-limited, and the numbers don't need to be reactive the way
 * the rest of the app's Convex data is.
 */
export function useBlogPostAnalytics(postId: Id<"blogPosts">) {
  const getForPost = useAction(api.blog.analytics.getForPost);
  const [data, setData] = useState<BlogPostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getForPost({ postId })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getForPost is a fresh function identity every render
  }, [postId]);

  return { data, loading, error };
}
