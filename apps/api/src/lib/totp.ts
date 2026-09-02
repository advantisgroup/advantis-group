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

function serverKey(): string {
  return getConvexServerKey();
}

function totpFor(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export interface EnrollmentStart {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export async function beginEnrollment(clerkUserId: string): Promise<EnrollmentStart> {
  const context = await getConvex().query(api.totp.apiEnrollmentContext, {
    serverKey: serverKey(),
    clerkUserId,
  });
  if (!context) throw Errors.forbidden("Your intranet account is not active");
  if (context.hasVerified) {
    throw Errors.badRequest("Remove your existing authenticator app before adding a new one");
  }
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const totp = totpFor(secret, context.email);
  await getConvex().mutation(api.totp.apiBeginEnrollment, {
    serverKey: serverKey(),
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
  const ciphertext = await getConvex().query(api.totp.apiPendingSecret, {
    serverKey: serverKey(),
    clerkUserId,
  });
  if (!ciphertext) throw Errors.badRequest("Start authenticator setup again");
  const secret = decrypt(ciphertext, ENC_KEY_ENV);
  const delta = totpFor(secret, clerkUserId).validate({ token: code.trim(), window: VERIFY_WINDOW });
  if (delta === null) throw Errors.badRequest("That code didn't match — check the time on your device");
  return await getConvex().mutation(api.totp.apiFinishEnrollment, {
    serverKey: serverKey(),
    clerkUserId,
  });
}

/** Returns false on a wrong/expired code rather than throwing — mistyped 6-digit codes are the normal case, not an error. */
export async function verifyCode(clerkUserId: string, code: string): Promise<boolean> {
  const ciphertext = await getConvex().query(api.totp.apiSecretForVerification, {
    serverKey: serverKey(),
    clerkUserId,
  });
  if (!ciphertext) throw Errors.badRequest("No authenticator app is set up for this account");
  const secret = decrypt(ciphertext, ENC_KEY_ENV);
  const ok = totpFor(secret, clerkUserId).validate({ token: code.trim(), window: VERIFY_WINDOW }) !== null;
  await getConvex().mutation(api.totp.apiRecordVerification, { serverKey: serverKey(), clerkUserId, ok });
  return ok;
}

export async function verifyRecoveryCode(clerkUserId: string, code: string): Promise<boolean> {
  const result = await getConvex().mutation(api.totp.apiVerifyRecoveryCode, {
    serverKey: serverKey(),
    clerkUserId,
    code,
  });
  return result.ok;
}

export async function getStatus(clerkUserId: string): Promise<{ enrolled: boolean }> {
  return await getConvex().query(api.totp.apiStatus, { serverKey: serverKey(), clerkUserId });
}

export async function removeMfa(clerkUserId: string): Promise<void> {
  await getConvex().mutation(api.totp.apiRemove, { serverKey: serverKey(), clerkUserId });
}
