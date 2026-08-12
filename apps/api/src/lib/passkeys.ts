import { randomBytes } from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { api } from "@advantis/convex/api";
import type { Id } from "@advantis/convex/dataModel";

import { getClerkClient } from "./clerk.js";
import { getConvex, getConvexServerKey } from "./convex.js";
import { Errors } from "./errors.js";

const FLOW_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 10;

type PasskeyFlowKind = "registration" | "authentication";

export type Passkey = {
  _id: string;
  name: string;
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

function config() {
  const rpID = process.env.WEBAUTHN_RP_ID;
  const configuredOrigins = process.env.WEBAUTHN_ALLOWED_ORIGINS;
  if (process.env.NODE_ENV === "production" && (!rpID || !configuredOrigins)) {
    throw new Error("WebAuthn production configuration is incomplete");
  }
  return {
    rpID: rpID ?? "localhost",
    origins: (configuredOrigins ?? "http://localhost:3001")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

function randomId(): string {
  return randomBytes(32).toString("base64url");
}

function serverKey(): string {
  return getConvexServerKey();
}

async function createChallenge(
  kind: PasskeyFlowKind,
  challenge: string,
  clerkUserId?: string,
): Promise<string> {
  const flowId = randomId();
  await getConvex().mutation(api.passkeys.apiCreateChallenge, {
    serverKey: serverKey(),
    flowId,
    challenge,
    kind,
    clerkUserId,
    expiresAt: Date.now() + FLOW_TTL_MS,
  });
  return flowId;
}

export function requirePasskeyOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || !config().origins.includes(origin)) throw Errors.forbidden();
}

export async function beginRegistration(clerkUserId: string) {
  const registration = await getConvex().mutation(api.passkeys.apiRegistrationContext, {
    serverKey: serverKey(),
    clerkUserId,
    webauthnUserId: randomId(),
  });
  if (!registration) throw Errors.forbidden("Your intranet account is not active");
  if (registration.credentials.length >= MAX_PASSKEYS) {
    throw Errors.badRequest("You can register up to ten passkeys");
  }
  const { rpID } = config();
  const options = await generateRegistrationOptions({
    rpName: "Advantis Group",
    rpID,
    userName: registration.email,
    userID: new Uint8Array(Buffer.from(registration.webauthnUserId, "base64url")),
    userDisplayName: registration.displayName,
    attestationType: "none",
    excludeCredentials: registration.credentials,
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  return { options, flowId: await createChallenge("registration", options.challenge, clerkUserId) };
}

export async function finishRegistration(
  clerkUserId: string,
  flowId: string,
  response: RegistrationResponseJSON,
  name: string,
) {
  const challenge = await getConvex().query(api.passkeys.apiRegistrationChallenge, {
    serverKey: serverKey(),
    flowId,
    clerkUserId,
  });
  if (!challenge) throw Errors.badRequest("This passkey request has expired");
  const { origins, rpID } = config();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verification.verified) throw Errors.badRequest("Passkey could not be verified");
  const info = verification.registrationInfo;
  const passkey = await getConvex().mutation(api.passkeys.apiCompleteRegistration, {
    serverKey: serverKey(),
    flowId,
    clerkUserId,
    credentialId: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
    counter: info.credential.counter,
    transports: response.response.transports,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    name,
  });
  await syncClerkMetadata(clerkUserId);
  return passkey;
}

export async function beginAuthentication() {
  const { rpID } = config();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  return { options, flowId: await createChallenge("authentication", options.challenge) };
}

export async function finishAuthentication(flowId: string, response: AuthenticationResponseJSON) {
  const context = await getConvex().query(api.passkeys.apiAuthenticationContext, {
    serverKey: serverKey(),
    flowId,
    credentialId: response.id,
  });
  if (!context) throw Errors.badRequest("This passkey request has expired");
  const { origins, rpID } = config();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: context.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    credential: {
      id: context.credential.id,
      publicKey: new Uint8Array(Buffer.from(context.credential.publicKey, "base64url")),
      counter: context.credential.counter,
      transports: context.credential.transports,
    },
    requireUserVerification: true,
  });
  if (!verification.verified) throw Errors.badRequest("Passkey could not be verified");
  const result = await getConvex().mutation(api.passkeys.apiCompleteAuthentication, {
    serverKey: serverKey(),
    flowId,
    credentialId: response.id,
    newCounter: verification.authenticationInfo.newCounter,
    deviceType: verification.authenticationInfo.credentialDeviceType,
    backedUp: verification.authenticationInfo.credentialBackedUp,
  });
  const signInToken = await getClerkClient().signInTokens.createSignInToken({
    userId: result.clerkUserId,
    expiresInSeconds: 60,
  });
  return signInToken.token;
}

export async function listPasskeys(clerkUserId: string): Promise<Passkey[]> {
  return await getConvex().query(api.passkeys.apiListForUser, {
    serverKey: serverKey(),
    clerkUserId,
  });
}

export async function renamePasskey(clerkUserId: string, passkeyId: string, name: string) {
  const passkey = await getConvex().mutation(api.passkeys.apiRenameForUser, {
    serverKey: serverKey(),
    clerkUserId,
    passkeyId: passkeyId as Id<"passkeys">,
    name,
  });
  await syncClerkMetadata(clerkUserId);
  return passkey;
}

export async function removePasskey(clerkUserId: string, passkeyId: string) {
  await getConvex().mutation(api.passkeys.apiRemoveForUser, {
    serverKey: serverKey(),
    clerkUserId,
    passkeyId: passkeyId as Id<"passkeys">,
  });
  await syncClerkMetadata(clerkUserId);
}

async function syncClerkMetadata(clerkUserId: string): Promise<void> {
  try {
    const passkeys = await listPasskeys(clerkUserId);
    await getClerkClient().users.updateUserMetadata(clerkUserId, {
      privateMetadata: {
        customPasskeys: { version: 1, count: passkeys.length, updatedAt: Date.now() },
      },
    });
  } catch (error) {
    console.error("[passkeys] Clerk metadata sync failed", error);
  }
}
