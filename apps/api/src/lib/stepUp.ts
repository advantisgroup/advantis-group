import { createHash } from "node:crypto";

import { api } from "@advantis/convex/api";
import { ConvexError } from "convex/values";

import { getConvex, getConvexServerKey } from "./convex.js";
import { verifyCode as verifyTotpCode, verifyRecoveryCode as verifyTotpRecoveryCode } from "./totp.js";

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
