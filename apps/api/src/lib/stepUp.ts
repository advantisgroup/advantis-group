import { createHash } from "node:crypto";

import { api } from "@advantis/convex/api";
import { ConvexError } from "convex/values";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { getConvex, getConvexServerKey } from "./convex.js";
import { verifyAuthenticationAssertion } from "./passkeys.js";
import {
  verifyCode as verifyTotpCode,
  verifyRecoveryCode as verifyTotpRecoveryCode,
} from "./totp.js";

export type VerifyMethod = "email_code" | "totp" | "recovery_code";
export type StepUpContext = "sign_in" | "destructive" | "admin_reverify";

function serverKey(): string {
  return getConvexServerKey();
}

/** Coarse network prefix, not the raw IP — a /24 for IPv4, first 4 groups for
 * IPv6 — enough to notice "this is a different place" without pinning down
 * an exact address. */
function coarseIp(ip: string): string {
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":");
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : ip;
}

function deviceHash(ip: string, userAgent: string): string {
  return createHash("sha256")
    .update(`${coarseIp(ip)}|${userAgent.trim().toLowerCase()}`)
    .digest("hex");
}

function convexErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data
  ) {
    return String((error.data as { message: unknown }).message);
  }
  return fallback;
}

export interface VerifyResult {
  ok: boolean;
  message?: string;
}

export async function requestStepUpCode(
  clerkUserId: string,
  sessionId: string,
  context: StepUpContext,
): Promise<void> {
  await getConvex().mutation(api.stepUp.apiRequestEmailCode, {
    serverKey: serverKey(),
    clerkUserId,
    sessionId,
    context,
  });
}

export async function verifyStepUp(
  clerkUserId: string,
  sessionId: string,
  method: VerifyMethod,
  code: string,
  context: StepUpContext,
): Promise<VerifyResult> {
  if (method === "email_code") {
    try {
      return await getConvex().mutation(api.stepUp.apiSubmitEmailCode, {
        serverKey: serverKey(),
        clerkUserId,
        sessionId,
        code,
        context,
      });
    } catch (error) {
      return { ok: false, message: convexErrorMessage(error, "That code didn't work.") };
    }
  }

  const ok =
    method === "totp"
      ? await verifyTotpCode(clerkUserId, code)
      : await verifyTotpRecoveryCode(clerkUserId, code);
  await getConvex().mutation(api.stepUp.apiRecordVerification, {
    serverKey: serverKey(),
    clerkUserId,
    sessionId,
    method,
    ok,
    context,
  });
  return ok ? { ok: true } : { ok: false, message: "That code didn't match." };
}

/**
 * Re-verifies an already signed-in session with a passkey — the same WebAuthn
 * check signing in runs, but it records a step-up instead of minting a new
 * session. A passkey is level 3, so this clears any step-up bar; the assertion
 * has to resolve to the caller's own account, or someone with any passkey at
 * all could clear someone else's prompt.
 */
export async function verifyStepUpPasskey(
  clerkUserId: string,
  sessionId: string,
  flowId: string,
  response: AuthenticationResponseJSON,
  context: StepUpContext,
): Promise<VerifyResult> {
  const assertion = await verifyAuthenticationAssertion(flowId, response);
  if (assertion.clerkUserId !== clerkUserId) {
    return { ok: false, message: "That passkey belongs to a different account." };
  }
  const { ok } = await getConvex().mutation(api.stepUp.apiRecordPasskeyStepUp, {
    serverKey: serverKey(),
    clerkUserId,
    sessionId,
    context,
  });
  return ok ? { ok: true } : { ok: false, message: "That passkey could not be accepted." };
}

/** Mints the single-use ticket `finishAuthentication` (passkeys.ts) hands to
 * the client alongside its Clerk sign-in token, so the browser can prove to
 * Convex — once it has a real session — that a passkey really was used. */
export async function issuePasskeyStepUpTicket(clerkUserId: string): Promise<string> {
  const { ticket } = await getConvex().mutation(api.stepUp.apiIssuePasskeyTicket, {
    serverKey: serverKey(),
    clerkUserId,
  });
  return ticket;
}

/** Redeems the ticket `issuePasskeyStepUpTicket` minted, right after the
 * browser calls `setActive()` on its new Clerk session. */
export async function claimPasskeyTicket(
  clerkUserId: string,
  sessionId: string,
  ticket: string,
): Promise<boolean> {
  const { ok } = await getConvex().mutation(api.stepUp.apiClaimPasskeyTicket, {
    serverKey: serverKey(),
    clerkUserId,
    ticket,
    sessionId,
  });
  return ok;
}

export type StepMethod = VerifyMethod | "passkey";

/** The `{ needsStepUp: true }` shape `packages/convex/convex/lib/stepUp.ts`
 * returns from admin actions, reused here so removal endpoints answer the
 * frontend in a shape it already handles. */
export interface StepUpHint {
  needsStepUp: true;
  requiredLevel: number;
  availableMethods: StepMethod[];
}

/** Checked immediately before a security credential is removed. Returns a
 * hint to hand straight back to the caller when the session hasn't proved
 * itself recently enough, or null when it's clear to proceed. */
export async function destructiveStepUpHint(
  clerkUserId: string,
  sessionId: string,
): Promise<StepUpHint | null> {
  const gate = await getConvex().query(api.stepUp.apiDestructiveGate, {
    serverKey: serverKey(),
    clerkUserId,
    sessionId,
  });
  if (gate.satisfied) return null;
  return {
    needsStepUp: true,
    requiredLevel: gate.requiredLevel,
    availableMethods: gate.availableMethods,
  };
}

export async function evaluateDevice(
  clerkUserId: string,
  sessionId: string,
  ip: string,
  userAgent: string,
): Promise<{ newDevice: boolean }> {
  return await getConvex().mutation(api.stepUp.apiEvaluateDevice, {
    serverKey: serverKey(),
    clerkUserId,
    sessionId,
    deviceHash: deviceHash(ip, userAgent),
  });
}
