import {
  ClockodoApiError,
  createClockodoClient,
  mapAbsenceStatus,
  mapAbsenceType,
  type ClockodoAbsence,
  type ClockodoAbsenceInput,
  type ClockodoCustomer,
  type ClockodoEntry,
  type ClockodoService,
  type ClockodoUser,
  type CoarseAbsenceStatus,
  type CoarseAbsenceType,
} from "@advantis/clockodo";

import { Errors } from "./errors.js";

export type {
  ClockodoAbsence,
  ClockodoAbsenceInput,
  ClockodoCustomer,
  ClockodoEntry,
  ClockodoService,
  ClockodoUser,
  CoarseAbsenceStatus,
  CoarseAbsenceType,
};
export { mapAbsenceStatus, mapAbsenceType };

function client() {
  const apiUser = process.env.CLOCKODO_API_USER;
  const apiKey = process.env.CLOCKODO_API_KEY;
  if (!apiUser || !apiKey) {
    throw Errors.internal(
      "CLOCKODO_API_USER / CLOCKODO_API_KEY not configured"
    );
  }
  return createClockodoClient({
    apiUser,
    apiKey,
    baseUrl: process.env.CLOCKODO_API_URL,
    externalApplication:
      process.env.CLOCKODO_EXTERNAL_APP ??
      "AdvantisIntranet;it@advantisgroup.de",
  });
}

async function upstream<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof ClockodoApiError) {
      if (error.status === 429) throw Errors.rateLimited("Clockodo rate limit");
      throw Errors.upstream(error.message);
    }
    throw error;
  }
}

export function getAbsence(id: number): Promise<ClockodoAbsence> {
  return upstream(client().getAbsence(id));
}

export function listAbsences(year: number): Promise<ClockodoAbsence[]> {
  return upstream(client().listAbsences(year));
}

export function createAbsence(
  input: ClockodoAbsenceInput
): Promise<ClockodoAbsence> {
  return upstream(client().createAbsence(input));
}

export function updateAbsence(
  id: number,
  input: Omit<ClockodoAbsenceInput, "users_id" | "status">
): Promise<ClockodoAbsence> {
  return upstream(client().updateAbsence(id, input));
}

export function listEntries(input: {
  userId: number;
  timeSince: string;
  timeUntil: string;
}): Promise<ClockodoEntry[]> {
  return upstream(client().listEntries(input));
}

export function listCustomers(): Promise<ClockodoCustomer[]> {
  return upstream(client().listCustomers());
}

export function listServices(): Promise<ClockodoService[]> {
  return upstream(client().listServices());
}

export function getRunningClock(): Promise<ClockodoEntry | null> {
  return upstream(client().getRunningClock());
}

export function getClockOptionsRights(userId: number): Promise<{
  customers: boolean | Record<string, unknown>;
  services: boolean | Record<string, unknown>;
}> {
  return upstream(client().getClockOptionsRights(userId));
}

export function startClock(input: {
  userId: number;
  customerId: number;
  serviceId: number;
  text?: string;
}): Promise<ClockodoEntry> {
  return upstream(client().startClock(input));
}

export function stopClock(
  entryId: number,
  userId: number
): Promise<ClockodoEntry | null> {
  return upstream(client().stopClock(entryId, userId));
}

export async function listCurrentAbsences(): Promise<ClockodoAbsence[]> {
  const now = new Date();
  const years = [now.getFullYear()];
  if (now.getMonth() === 0) years.push(now.getFullYear() - 1);
  return (await Promise.all(years.map(year => listAbsences(year)))).flat();
}

let userCache: { map: Map<number, ClockodoUser>; expiresAt: number } | null =
  null;
const USER_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getUserEmail(
  usersId: number
): Promise<string | undefined> {
  if (!userCache || userCache.expiresAt < Date.now()) {
    const users = await upstream(client().listUsers());
    userCache = {
      map: new Map(users.map(user => [user.id, user])),
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    };
  }
  return userCache.map.get(usersId)?.email;
}

export async function getClockodoUser(
  usersId: number
): Promise<ClockodoUser | undefined> {
  if (!userCache || userCache.expiresAt < Date.now()) {
    const users = await upstream(client().listUsers());
    userCache = {
      map: new Map(users.map(user => [user.id, user])),
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    };
  }
  return userCache.map.get(usersId);
}
