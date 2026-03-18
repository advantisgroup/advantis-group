"use client";

import React from "react";

import { useLocale } from "next-intl";

import { hasClerkBrowserConfig, loadClerk } from "@/lib/clerk/browser";
import { type ClerkInstance, type ClerkUserResource } from "@/types/clerk";

type ClerkAuthStatus = "idle" | "loading" | "ready" | "error" | "disabled";

interface ClerkAuthContextValue {
  clerk: ClerkInstance | null;
  user: ClerkUserResource | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  isEnabled: boolean;
  error: string | null;
  status: ClerkAuthStatus;
}

const ClerkAuthContext = React.createContext<ClerkAuthContextValue>({
  clerk: null,
  user: null,
  isLoaded: false,
  isSignedIn: false,
  isEnabled: false,
  error: null,
  status: "idle",
});

export const useClerkAuth = () => React.useContext(ClerkAuthContext);

export const ClerkAuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const locale = useLocale();
  const isEnabled = hasClerkBrowserConfig();
  const [state, setState] = React.useState<ClerkAuthContextValue>({
    clerk: null,
    user: null,
    isLoaded: false,
    isSignedIn: false,
    isEnabled,
    error: null,
    status: isEnabled ? "loading" : "disabled",
  });

  React.useEffect(() => {
    if (!isEnabled) {
      setState(current => ({
        ...current,
        status: "disabled",
        isEnabled: false,
      }));

      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    loadClerk({
      locale,
      accountPath: `/${locale}/account`,
      signInPath: `/${locale}/sign-in`,
      signUpPath: `/${locale}/sign-up`,
    })
      .then(clerk => {
        if (cancelled) {
          return;
        }

        const syncState = (user: ClerkUserResource | null | undefined) => {
          setState({
            clerk,
            user: user ?? clerk.user ?? null,
            isLoaded: Boolean(clerk.isLoaded),
            isSignedIn: Boolean(clerk.isSignedIn),
            isEnabled: true,
            error: null,
            status: "ready",
          });
        };

        syncState(clerk.user);
        unsub = clerk.addListener(({ user }) => syncState(user));
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }

        setState({
          clerk: null,
          user: null,
          isLoaded: false,
          isSignedIn: false,
          isEnabled: true,
          error: error.message,
          status: "error",
        });
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isEnabled, locale]);

  return (
    <ClerkAuthContext.Provider value={state}>
      {children}
    </ClerkAuthContext.Provider>
  );
};
