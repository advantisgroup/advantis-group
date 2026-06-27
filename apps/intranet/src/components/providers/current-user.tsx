"use client";

import type { ReactNode } from "react";

import { createContext, useContext } from "react";

import { type Role } from "@advantis/types";

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
  avatar: string | null;
  lastSeenAt: number | null;
  createdAt: number;
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
