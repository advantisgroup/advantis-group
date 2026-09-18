import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { api } from "@advantis/convex/api";

import { decrypt, encrypt } from "./crypto.js";
import { getConvex, getConvexServerKey } from "./convex.js";
import { Errors } from "./errors.js";

const ISSUER = "Advantis Group";
const ENC_KEY_ENV = "TOTP_ENC_KEY";
// One step either side of "now" absorbs normal clock drift on the user's device.
const VERIFY_WINDOW = 1;
const PERIOD_SECONDS = 30;

/** Which 30-second slot a code belonged to. `validate` hands back the offset
 * in periods from now, so adding it to the current slot gives the absolute
 * step — the thing we store to stop the same code being accepted twice. */
function stepFromDelta(delta: number): number {
  return Math.floor(Date.now() / 1000 / PERIOD_SECONDS) + delta;
}

function totpFor(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export interface EnrollmentStart {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export async function beginEnrollment(clerkUserId: string): Promise<EnrollmentStart> {
  const context = await getConvex().query(api.security.totp.apiEnrollmentContext, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
  if (!context) throw Errors.forbidden("Your intranet account is not active");
  if (context.hasVerified) {
    throw Errors.badRequest("Remove your existing authenticator app before adding a new one");
  }
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const totp = totpFor(secret, context.email);
  await getConvex().mutation(api.security.totp.apiBeginEnrollment, {
    serverKey: getConvexServerKey(),
    clerkUserId,
    secretCiphertext: encrypt(secret, ENC_KEY_ENV),
  });
  const otpauthUrl = totp.toString();
  return { secret, otpauthUrl, qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl) };
}

export async function finishEnrollment(
  clerkUserId: string,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  const ciphertext = await getConvex().query(api.security.totp.apiPendingSecret, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
  if (!ciphertext) throw Errors.badRequest("Start authenticator setup again");
  const secret = decrypt(ciphertext, ENC_KEY_ENV);
  const delta = totpFor(secret, clerkUserId).validate({
    token: code.trim(),
    window: VERIFY_WINDOW,
  });
  if (delta === null)
    throw Errors.badRequest("That code didn't match — check the time on your device");
  return await getConvex().mutation(api.security.totp.apiFinishEnrollment, {
    serverKey: getConvexServerKey(),
    clerkUserId,
    usedStep: stepFromDelta(delta),
  });
}

/** Returns false on a wrong/expired code rather than throwing — mistyped 6-digit codes are the normal case, not an error. */
export async function verifyCode(clerkUserId: string, code: string): Promise<boolean> {
  const credential = await getConvex().query(api.security.totp.apiSecretForVerification, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
  if (!credential) throw Errors.badRequest("No authenticator app is set up for this account");
  const secret = decrypt(credential.secretCiphertext, ENC_KEY_ENV);
  const delta = totpFor(secret, clerkUserId).validate({
    token: code.trim(),
    window: VERIFY_WINDOW,
  });
  // A valid signature isn't enough — the drift window keeps one code usable
  // across three steps, so a code from a step we've already accepted is a
  // replay, not a fresh proof of possession.
  const step = delta === null ? null : stepFromDelta(delta);
  const ok = step !== null && (credential.lastUsedStep === null || step > credential.lastUsedStep);
  await getConvex().mutation(api.security.totp.apiRecordVerification, {
    serverKey: getConvexServerKey(),
    clerkUserId,
    ok,
    ...(ok && step !== null ? { usedStep: step } : {}),
  });
  return ok;
}

export async function verifyRecoveryCode(clerkUserId: string, code: string): Promise<boolean> {
  const result = await getConvex().mutation(api.security.totp.apiVerifyRecoveryCode, {
    serverKey: getConvexServerKey(),
    clerkUserId,
    code,
  });
  return result.ok;
}

/** Replaces the whole set — the old codes stop working immediately. */
export async function regenerateRecoveryCodes(
  clerkUserId: string,
): Promise<{ recoveryCodes: string[] }> {
  return await getConvex().mutation(api.security.totp.apiRegenerateRecoveryCodes, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
}

export async function getStatus(clerkUserId: string): Promise<{
  enrolled: boolean;
  needsRotation: boolean;
  recoveryCodesRemaining: number;
  recoveryCodesTotal: number;
}> {
  return await getConvex().query(api.security.totp.apiStatus, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
}

export async function removeMfa(clerkUserId: string): Promise<void> {
  await getConvex().mutation(api.security.totp.apiRemove, {
    serverKey: getConvexServerKey(),
    clerkUserId,
  });
}
