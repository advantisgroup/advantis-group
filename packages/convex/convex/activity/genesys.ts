"use node";

import { v } from "convex/values";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import {
  normalizePresence,
  normalizeRoutingStatus,
  isWrapUpPresence,
  type GenesysPresence,
  type GenesysRoutingStatus,
} from "./lib/state";
import {
  signalSecret,
  reportHealth,
  healthStatusOf,
  errMessage,
  type Mapping,
} from "./lib/integrationsShared";

/**
 * Genesys telephony client (presence + routing status), running inside Convex's
 * Node runtime. The scheduled orchestrator in `integrations.ts` calls
 * `pollGenesys`.
 */

const GENESYS_REGION = () => process.env.GENESYS_REGION ?? "mypurecloud.de";

let genesysToken: { accessToken: string; expiresAt: number } | null = null;

async function genesysAccessToken(): Promise<string> {
  if (genesysToken && Date.now() < genesysToken.expiresAt) {
    return genesysToken.accessToken;
  }
  const clientId = process.env.GENESYS_CLIENT_ID;
  const clientSecret = process.env.GENESYS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GENESYS_CLIENT_ID / GENESYS_CLIENT_SECRET not configured");
  }
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`https://login.${GENESYS_REGION()}/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Genesys token request failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  genesysToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return genesysToken.accessToken;
}

async function genesysGet<T>(path: string): Promise<T> {
  const token = await genesysAccessToken();
  const res = await fetch(`https://api.${GENESYS_REGION()}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Genesys GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function fetchGenesysUserState(genesysUserId: string): Promise<{
  routingStatus?: GenesysRoutingStatus;
  presence?: GenesysPresence;
  wrapUp: boolean;
}> {
  const [routing, presence] = await Promise.all([
    genesysGet<{ status?: string }>(
      `/api/v2/users/${genesysUserId}/routingstatus`
    ),
    genesysGet<{ presenceDefinition?: { systemPresence?: string } }>(
      `/api/v2/users/${genesysUserId}/presences/purecloud`
    ),
  ]);
  const system = presence.presenceDefinition?.systemPresence;
  return {
    routingStatus: normalizeRoutingStatus(routing.status),
    presence: normalizePresence(system),
    wrapUp: isWrapUpPresence(system),
  };
}

async function pushGenesys(
  ctx: ActionCtx,
  employeeId: string,
  s: {
    routingStatus?: GenesysRoutingStatus;
    presence?: GenesysPresence;
    wrapUp: boolean;
  }
) {
  await ctx.runMutation(api.activity.state.pushSignal, {
    secret: signalSecret(),
    employeeId,
    source: "genesys",
    genesysRoutingStatus: s.routingStatus,
    genesysPresence: s.presence,
    genesysWrapUp: s.wrapUp,
  });
}

/** Poll slice: per-user routing status + presence for everyone mapped to Genesys. */
export async function pollGenesys(
  ctx: ActionCtx,
  mappings: Mapping[]
): Promise<void> {
  const genesysPeople = mappings.filter(p => p.genesysUserId);
  if (genesysPeople.length === 0) return;
  try {
    for (const p of genesysPeople) {
      const s = await fetchGenesysUserState(p.genesysUserId!);
      await pushGenesys(ctx, p.employeeId, s);
    }
    await reportHealth(ctx, "genesys", "ok");
  } catch (err) {
    await reportHealth(ctx, "genesys", healthStatusOf(err), errMessage(err));
  }
}

/** On-demand single-user Genesys sync (used by the dashboard /sync endpoint). */
export const syncGenesys = action({
  args: {
    secret: v.string(),
    employeeId: v.string(),
    genesysUserId: v.string(),
  },
  handler: async (ctx, { secret, employeeId, genesysUserId }) => {
    if (secret !== process.env.ACTIVITYTRACK_SIGNAL_SECRET) {
      return { ok: false, error: "forbidden" as const };
    }
    try {
      const s = await fetchGenesysUserState(genesysUserId);
      await pushGenesys(ctx, employeeId, s);
      await reportHealth(ctx, "genesys", "ok");
      return { ok: true as const };
    } catch (err) {
      await reportHealth(ctx, "genesys", healthStatusOf(err), errMessage(err));
      return { ok: false, error: "genesys_unavailable" as const };
    }
  },
});
