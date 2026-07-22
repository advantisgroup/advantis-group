"use client";

/* eslint-disable react-refresh/only-export-components --
   Context provider colocated with its hooks (useCurrentUser/useIsManager/
   useIsAdmin), which are imported across the app. */
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import { type Role } from "@advantis/types";

export type Capability =
  | "manage_members"
  | "access_integrations"
  | "manage_uploads"
  | "view_activity_admin";

export interface CurrentUser {
  _id: string;
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: Role;
  department: string | null;
  jobTitle: string | null;
  phone: string | null;
  teams: string[];
  managerId: string | null;
  status: "active" | "suspended";
  external: boolean;
  updatesEmailConsent: boolean;
  gfAccess: boolean;
  uploadRequestsEnabled: boolean;
  customRoleId: string | null;
  capabilities: Capability[];
  applicantAccessDelegate: boolean;
  applicantAccess: boolean;
  roleLabel: string | null;
  avatar: string | null;
  lastSeenAt: number | null;
  createdAt: number;
  dateOfBirth: string | null;
  showBirthdayPublicly: boolean;
  hireDate: string | null;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider");
  }
  return user;
}

export function useIsManager(): boolean {
  const user = useCurrentUser();
  return user.role === "admin" || user.role === "manager";
}

export function useIsAdmin(): boolean {
  return useCurrentUser().role === "admin";
}

/**
 * True when the current user has `capability` — either directly (manager+
 * already implies every capability) or via their assigned custom role.
 * Mirrors the server-side `requireCapability` check; this is UI-only gating,
 * not the enforcement itself.
 */
export function useHasCapability(capability: Capability): boolean {
  const user = useCurrentUser();
  return (
    user.role === "admin" ||
    user.role === "manager" ||
    user.capabilities.includes(capability)
  );
}

/** True when the user can see the Applicant Management nav item at all —
 * either they have feature access, or they're a delegate who can grant it to
 * others (see `useCanManageApplicantAccess` for the delegate-only case). */
export function useHasApplicantAccess(): boolean {
  const user = useCurrentUser();
  return (
    user.role === "admin" ||
    user.applicantAccess ||
    user.applicantAccessDelegate
  );
}

/** True when the user can grant/revoke Applicant Management access for others. */
export function useCanManageApplicantAccess(): boolean {
  const user = useCurrentUser();
  return user.role === "admin" || user.applicantAccessDelegate;
}
