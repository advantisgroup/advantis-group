import { api } from "@advantis/convex/api";
import { ConvexError } from "convex/values";
import type { Id } from "@advantis/convex/dataModel";

import { getConvex, getConvexServerKey } from "./convex.js";
import { Errors } from "./errors.js";

function serverKey(): string {
  return getConvexServerKey();
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

export interface SecondaryEmail {
  _id: string;
  email: string;
  verified: boolean;
  addedAt: number;
}

export async function listSecondaryEmails(clerkUserId: string): Promise<SecondaryEmail[]> {
  return await getConvex().query(api.secondaryEmails.apiList, {
    serverKey: serverKey(),
    clerkUserId,
  });
}

export async function requestSecondaryEmailCode(
  clerkUserId: string,
  email: string,
): Promise<{ alreadyVerified: boolean }> {
  try {
    return await getConvex().mutation(api.secondaryEmails.apiRequestCode, {
      serverKey: serverKey(),
      clerkUserId,
      email,
    });
  } catch (error) {
    throw Errors.badRequest(convexErrorMessage(error, "Couldn't send a code to that address."));
  }
}

export async function verifySecondaryEmailCode(
  clerkUserId: string,
  email: string,
  code: string,
): Promise<{ ok: boolean; message?: string }> {
  return await getConvex().mutation(api.secondaryEmails.apiVerifyCode, {
    serverKey: serverKey(),
    clerkUserId,
    email,
    code,
  });
}

export async function removeSecondaryEmail(
  clerkUserId: string,
  secondaryEmailId: string,
): Promise<void> {
  try {
    await getConvex().mutation(api.secondaryEmails.apiRemove, {
      serverKey: serverKey(),
      clerkUserId,
      secondaryEmailId: secondaryEmailId as Id<"userSecondaryEmails">,
    });
  } catch (error) {
    throw Errors.notFound(convexErrorMessage(error, "Not found."));
  }
}
