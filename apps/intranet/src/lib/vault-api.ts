"use client";

import { useMemo } from "react";

import { type Doc } from "@advantis/convex/dataModel";

import { useIntranetApiClient } from "@/lib/api-client";

export type VaultCategory = Doc<"vaultEntries">["category"];

export interface VaultInput {
  title: string;
  category: VaultCategory;
  username?: string;
  url?: string;
  notes?: string;
  password?: string;
}

export interface VaultSecret {
  password: string;
  notes: string | null;
}

/** apps/api routes/vault.ts — the only place passwords exist in plain text. */
export function useVaultApi() {
  const api = useIntranetApiClient();
  return useMemo(() => {
    const send = <T>(path: string, method: string, body?: unknown) =>
      api.fetchJson<T>(path, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    return {
      create: (input: VaultInput & { password: string }) =>
        send<{ id: string }>("/vault/entries", "POST", input),
      update: (id: string, input: VaultInput) =>
        send<{ ok: true }>(`/vault/entries/${id}`, "PUT", input),
      reveal: (id: string) => send<VaultSecret>(`/vault/entries/${id}/reveal`, "POST"),
    };
  }, [api]);
}
