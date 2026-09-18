import { getCachedAbsences, invalidateAbsencesCache, setCachedAbsences } from "./clockodo-cache.js";
import { Errors } from "./errors.js";

// The @advantis/clockodo client used to live here; it was inlined back in
// after being briefly split into a workspace package. That package shipped
// raw TypeScript (`./src/index.ts`, no JS build) with apps/api as its only
// consumer, which hit the same problem @advantis/types hits (see the note
// atop ./types.ts): Vercel's Elysia deploy runs on Node, which can't execute
// a workspace `.ts` file at runtime, so the file tracer drops the package
// from the bundle and every route crashes on cold start with
// ERR_MODULE_NOT_FOUND. Keeping the client here severs that runtime
// dependency; if another app ever needs it too, give the shared package an
// actual build step (dist/ + compiled exports) before reintroducing it.

export interface ClockodoAbsence {
  id: number;
  users_id: number;
  date_since: string;
  date_until: string;
  status: number;
  type: number;
  note: string | null;
  count_days: number | null;
  count_hours: number | null;
  sick_note: boolean | null;
}

export interface ClockodoUser {
  id: number;
  name: string;
  email: string;
}

export interface ClockodoEntry {
  id: number;
  users_id: number;
  customers_id?: number;
  services_id?: number;
  customers_name?: string;
  services_name?: string;
  time_since: string | null;
  time_until: string | null;
}

export interface ClockodoCustomer {
  id: number;
  name: string;
  active: boolean;
}

export interface ClockodoService {
  id: number;
  name: string;
  active: boolean;
}

type ClockodoRights = boolean | Record<string, unknown>;

export interface ClockodoAbsenceInput {
  users_id: number;
  date_since: string;
  date_until: string;
  type: number;
  note?: string | null;
  count_days?: number | null;
  count_hours?: number | null;
  sick_note?: boolean | null;
  status?: 0 | 1 | 2;
}

interface ClockodoClientOptions {
  apiUser: string;
  apiKey: string;
  externalApplication: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class ClockodoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ClockodoApiError";
  }
}

interface ClockodoPaging {
  current_page: number;
  count_pages: number;
}

export type CoarseAbsenceType = "vacation" | "sick" | "personal" | "other";
export type CoarseAbsenceStatus = "pending" | "approved" | "denied" | "cancelled";

/** Maps Clockodo's detailed absence codes to the categories the Advantis UI exposes. */
export function mapAbsenceType(clockodoType: number): CoarseAbsenceType {
  switch (clockodoType) {
    case 1:
      return "vacation";
    case 4:
    case 5:
    case 11:
    case 12:
    case 13:
    case 15:
      return "sick";
    case 2:
    case 6:
    case 7:
    case 10:
    case 14:
      return "personal";
    default:
      return "other";
  }
}

/** Maps Clockodo's numeric workflow state to the shared application vocabulary. */
export function mapAbsenceStatus(clockodoStatus: number): CoarseAbsenceStatus {
  switch (clockodoStatus) {
    case 0:
      return "pending";
    case 1:
      return "approved";
    case 2:
      return "denied";
    case 3:
    case 4:
      return "cancelled";
    default:
      return "pending";
  }
}

/** Clockodo wants ISO timestamps without milliseconds. */
export function toClockodoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function createClockodoClient(options: ClockodoClientOptions) {
  const baseUrl = (options.baseUrl ?? "https://my.clockodo.com/api").replace(/\/$/, "");
  const request = options.fetch ?? globalThis.fetch;

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await request(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "X-ClockodoApiUser": options.apiUser,
        "X-ClockodoApiKey": options.apiKey,
        "X-Clockodo-External-Application": options.externalApplication,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ClockodoApiError(
        `Clockodo ${init?.method ?? "GET"} ${path} failed: ${response.status}${body ? ` — ${body.slice(0, 500)}` : ""}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  function get<T>(path: string): Promise<T> {
    return requestJson<T>(path);
  }

  /** Clockodo's v3/v4 list endpoints all paginate the same "data" + "paging" shape. */
  async function getAllPages<T>(basePath: string, query: string): Promise<T[]> {
    const results: T[] = [];
    let page = 1;
    const prefix = query ? `${query}&` : "";
    for (;;) {
      const response = await get<{ data: T[]; paging?: ClockodoPaging }>(
        `${basePath}?${prefix}page=${page}`,
      );
      results.push(...(response.data ?? []));
      if (!response.paging || page >= response.paging.count_pages) return results;
      page += 1;
    }
  }

  return {
    async getAbsence(id: number): Promise<ClockodoAbsence> {
      const response = await get<{ data: ClockodoAbsence }>(`/v4/absences/${id}`);
      return response.data;
    },
    listAbsences(year: number): Promise<ClockodoAbsence[]> {
      return getAllPages<ClockodoAbsence>(
        "/v4/absences",
        `filter[year]=${year}&scope=viewableAbsences`,
      );
    },
    listUsers(): Promise<ClockodoUser[]> {
      return getAllPages<ClockodoUser>("/v3/users", "");
    },
    async listEntries({
      userId,
      timeSince,
      timeUntil,
    }: {
      userId: number;
      timeSince: string;
      timeUntil: string;
    }): Promise<ClockodoEntry[]> {
      const query = new URLSearchParams({
        time_since: timeSince,
        time_until: timeUntil,
        "filter[users_id]": String(userId),
      });
      const response = await get<{ entries: ClockodoEntry[] }>(`/v2/entries?${query}`);
      return response.entries ?? [];
    },
    async deleteEntry(id: number, userId: number): Promise<void> {
      await requestJson(`/v2/entries/${id}?users_id=${userId}`, {
        method: "DELETE",
      });
    },
    listCustomers(): Promise<ClockodoCustomer[]> {
      return getAllPages<ClockodoCustomer>("/v3/customers", "filter[active]=true");
    },
    listServices(): Promise<ClockodoService[]> {
      return getAllPages<ClockodoService>("/v4/services", "filter[active]=true");
    },
    async getRunningClock(userId: number): Promise<ClockodoEntry | null> {
      // Without users_id this reads the API service account's own clock
      // (always idle, since no employee clocks in as that account) instead
      // of the employee's — always resolving to "nothing is running" and
      // making every stop-clock request fail its ownership check.
      const response = await get<{ running: ClockodoEntry | null }>(`/v2/clock?users_id=${userId}`);
      return response.running ?? null;
    },
    async getClockOptionsRights(userId: number): Promise<{
      customers: ClockodoRights;
      services: ClockodoRights;
    }> {
      const [customerAccess, serviceAccess] = await Promise.all([
        get<{ add: ClockodoRights }>(`/v2/users/${userId}/access/customers-projects`),
        get<{ add: ClockodoRights }>(`/v2/users/${userId}/access/services`),
      ]);
      return { customers: customerAccess.add, services: serviceAccess.add };
    },
    async startClock(input: {
      userId: number;
      customerId: number;
      serviceId: number;
    }): Promise<ClockodoEntry> {
      const response = await requestJson<{ running: ClockodoEntry }>("/v2/clock", {
        method: "POST",
        body: JSON.stringify({
          users_id: input.userId,
          customers_id: input.customerId,
          services_id: input.serviceId,
        }),
      });
      return response.running;
    },
    async stopClock(entryId: number, userId: number): Promise<ClockodoEntry | null> {
      const response = await requestJson<{
        stopped: ClockodoEntry;
        running: ClockodoEntry | null;
      }>(`/v2/clock/${entryId}?users_id=${userId}`, { method: "DELETE" });
      return response.running ?? null;
    },
    async createAbsence(input: ClockodoAbsenceInput): Promise<ClockodoAbsence> {
      const response = await requestJson<{ data: ClockodoAbsence }>("/v4/absences", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return response.data;
    },
    async updateAbsence(
      id: number,
      input: Omit<ClockodoAbsenceInput, "users_id" | "status">,
    ): Promise<ClockodoAbsence> {
      const response = await requestJson<{ data: ClockodoAbsence }>(`/v4/absences/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
      return response.data;
    },
    /** Approve (1) or deny (2) a pending absence. Clockodo's partial-PUT
     * support for `{status}` alone isn't confirmed, so this re-sends the
     * absence's existing editable fields alongside the new status — the
     * same full-payload shape `updateAbsence` above always sends — rather
     * than risking a bare status-only body the API might reject. */
    async setAbsenceStatus(id: number, status: 1 | 2): Promise<ClockodoAbsence> {
      const existing = await get<{ data: ClockodoAbsence }>(`/v4/absences/${id}`);
      const response = await requestJson<{ data: ClockodoAbsence }>(`/v4/absences/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          date_since: existing.data.date_since,
          date_until: existing.data.date_until,
          type: existing.data.type,
          note: existing.data.note,
          count_days: existing.data.count_days,
          count_hours: existing.data.count_hours,
          sick_note: existing.data.sick_note,
          status,
        }),
      });
      return response.data;
    },
  };
}

export class ClockodoClient {
  private userCache: { map: Map<number, ClockodoUser>; expiresAt: number } | null = null;

  private client() {
    const apiUser = process.env.CLOCKODO_API_USER;
    const apiKey = process.env.CLOCKODO_API_KEY;
    if (!apiUser || !apiKey) {
      throw Errors.internal("CLOCKODO_API_USER / CLOCKODO_API_KEY not configured");
    }
    return createClockodoClient({
      apiUser,
      apiKey,
      baseUrl: process.env.CLOCKODO_API_URL,
      externalApplication:
        process.env.CLOCKODO_EXTERNAL_APP ?? "AdvantisIntranet;it@advantisgroup.de",
    });
  }

  private async upstream<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (error instanceof ClockodoApiError) {
        console.error(`[clockodo] upstream ${error.status}: ${error.message}`);
        if (error.status === 429) throw Errors.rateLimited("Clockodo rate limit");
        throw Errors.upstream(error.message);
      }
      throw error;
    }
  }

  getAbsence(id: number): Promise<ClockodoAbsence> {
    return this.upstream(this.client().getAbsence(id));
  }

  listAbsences(year: number): Promise<ClockodoAbsence[]> {
    return this.upstream(this.client().listAbsences(year));
  }

  private async listAbsencesForYears(years: number[]): Promise<ClockodoAbsence[]> {
    const cached = await getCachedAbsences<ClockodoAbsence[]>(years);
    if (cached) return cached;
    const data = (await Promise.all(years.map((year) => this.listAbsences(year)))).flat();
    await setCachedAbsences(years, data);
    return data;
  }

  async createAbsence(input: ClockodoAbsenceInput): Promise<ClockodoAbsence> {
    const absence = await this.upstream(this.client().createAbsence(input));
    await invalidateAbsencesCache();
    return absence;
  }

  async updateAbsence(
    id: number,
    input: Omit<ClockodoAbsenceInput, "users_id" | "status">,
  ): Promise<ClockodoAbsence> {
    const absence = await this.upstream(this.client().updateAbsence(id, input));
    await invalidateAbsencesCache();
    return absence;
  }

  async setAbsenceStatus(id: number, status: 1 | 2): Promise<ClockodoAbsence> {
    const absence = await this.upstream(this.client().setAbsenceStatus(id, status));
    await invalidateAbsencesCache();
    return absence;
  }

  /** No caching here on purpose — unlike absences above, clock entries are
   * exactly the kind of data that changes second-to-second (starting/stopping
   * the clock, live Timetable views) and must always read straight through to
   * Clockodo. */
  listEntries(input: {
    userId: number;
    timeSince: string;
    timeUntil: string;
  }): Promise<ClockodoEntry[]> {
    return this.upstream(this.client().listEntries(input));
  }

  deleteEntry(id: number, userId: number): Promise<void> {
    return this.upstream(this.client().deleteEntry(id, userId));
  }

  listCustomers(): Promise<ClockodoCustomer[]> {
    return this.upstream(this.client().listCustomers());
  }

  listServices(): Promise<ClockodoService[]> {
    return this.upstream(this.client().listServices());
  }

  getRunningClock(userId: number): Promise<ClockodoEntry | null> {
    return this.upstream(this.client().getRunningClock(userId));
  }

  getClockOptionsRights(userId: number): Promise<{
    customers: boolean | Record<string, unknown>;
    services: boolean | Record<string, unknown>;
  }> {
    return this.upstream(this.client().getClockOptionsRights(userId));
  }

  startClock(input: {
    userId: number;
    customerId: number;
    serviceId: number;
  }): Promise<ClockodoEntry> {
    return this.upstream(this.client().startClock(input));
  }

  stopClock(entryId: number, userId: number): Promise<ClockodoEntry | null> {
    return this.upstream(this.client().stopClock(entryId, userId));
  }

  async listCurrentAbsences(): Promise<ClockodoAbsence[]> {
    const now = new Date();
    const years = [now.getFullYear()];
    if (now.getMonth() === 0) years.push(now.getFullYear() - 1);
    return this.listAbsencesForYears(years);
  }

  private async usersById(): Promise<Map<number, ClockodoUser>> {
    if (!this.userCache || this.userCache.expiresAt < Date.now()) {
      const users = await this.upstream(this.client().listUsers());
      this.userCache = {
        map: new Map(users.map((user) => [user.id, user])),
        expiresAt: Date.now() + 5 * 60 * 1000,
      };
    }
    return this.userCache.map;
  }

  async getUserEmail(usersId: number): Promise<string | undefined> {
    return (await this.usersById()).get(usersId)?.email;
  }

  async getUser(usersId: number): Promise<ClockodoUser | undefined> {
    return (await this.usersById()).get(usersId);
  }
}

export const clockodo = new ClockodoClient();
