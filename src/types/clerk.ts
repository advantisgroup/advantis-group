export interface ClerkUserResource {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  primaryEmailAddress?: {
    emailAddress?: string | null;
  } | null;
  imageUrl?: string | null;
}

export interface ClerkListenerResources {
  user?: ClerkUserResource | null;
  session?: unknown;
}

export interface ClerkInstance {
  isLoaded?: boolean;
  isSignedIn?: boolean;
  user?: ClerkUserResource | null;
  load: (options?: Record<string, unknown>) => Promise<void>;
  addListener: (
    listener: (resources: ClerkListenerResources) => void,
  ) => () => void;
  mountSignIn: (
    node: HTMLDivElement,
    options?: Record<string, unknown>,
  ) => void;
  unmountSignIn: (node?: HTMLDivElement) => void;
  mountSignUp: (
    node: HTMLDivElement,
    options?: Record<string, unknown>,
  ) => void;
  unmountSignUp: (node?: HTMLDivElement) => void;
  mountUserButton: (
    node: HTMLDivElement,
    options?: Record<string, unknown>,
  ) => void;
  unmountUserButton: (node?: HTMLDivElement) => void;
  mountUserProfile: (
    node: HTMLDivElement,
    options?: Record<string, unknown>,
  ) => void;
  unmountUserProfile: (node?: HTMLDivElement) => void;
  signOut: (options?: Record<string, unknown>) => Promise<void>;
}

declare global {
  interface Window {
    Clerk?: ClerkInstance;
  }
}

export {};
