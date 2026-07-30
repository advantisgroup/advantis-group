"use client";

import { useEffect } from "react";

import posthog from "posthog-js";

import { useCurrentUser } from "@/components/providers/current-user";

/** Ties PostHog's anonymous session to the signed-in Convex/Clerk identity,
 * so events captured across the app (nav, search, admin actions) roll up to
 * a person instead of staying anonymous. Mount once, inside
 * `CurrentUserProvider`. */
export function PostHogIdentify() {
  const user = useCurrentUser();

  useEffect(() => {
    posthog.identify(user.clerkUserId, {
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    });
  }, [user.clerkUserId, user.email, user.name, user.role, user.department]);

  return null;
}
