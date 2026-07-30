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
  status?: 0 | 1;
}

export interface ClockodoClientOptions {
  apiUser: string;
  apiKey: string;
  externalApplication: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class ClockodoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
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
export type CoarseAbsenceStatus =
  "pending" | "approved" | "denied" | "cancelled";

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

export function createClockodoClient(options: ClockodoClientOptions) {
  const baseUrl = (options.baseUrl ?? "https://my.clockodo.com/api").replace(
    /\/$/,
    ""
  );
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
      throw new ClockodoApiError(
        `Clockodo GET ${path} failed: ${response.status}`,
        response.status
      );
    }
    return (await response.json()) as T;
  }

  function get<T>(path: string): Promise<T> {
    return requestJson<T>(path);
  }

  return {
    async getAbsence(id: number): Promise<ClockodoAbsence> {
      const response = await get<{ data: ClockodoAbsence }>(
        `/v4/absences/${id}`
      );
      return response.data;
    },
    async listAbsences(year: number): Promise<ClockodoAbsence[]> {
      const results: ClockodoAbsence[] = [];
      let page = 1;
      for (;;) {
        const response = await get<{
          data: ClockodoAbsence[];
          paging?: ClockodoPaging;
        }>(
          `/v4/absences?filter[year]=${year}&scope=viewableAbsences&page=${page}`
        );
        results.push(...(response.data ?? []));
        if (!response.paging || page >= response.paging.count_pages)
          return results;
        page += 1;
      }
    },
    async listUsers(): Promise<ClockodoUser[]> {
      const response = await get<{ users: ClockodoUser[] }>("/v2/users");
      return response.users ?? [];
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
      const response = await get<{ entries: ClockodoEntry[] }>(
        `/v2/entries?${query}`
      );
      return response.entries ?? [];
    },
    async listCustomers(): Promise<ClockodoCustomer[]> {
      const response = await get<{ customers: ClockodoCustomer[] }>(
        "/v2/customers?filter[active]=true"
      );
      return response.customers ?? [];
    },
    async listServices(): Promise<ClockodoService[]> {
      const response = await get<{ services: ClockodoService[] }>(
        "/v2/services?filter[active]=true"
      );
      return response.services ?? [];
    },
    async getRunningClock(): Promise<ClockodoEntry | null> {
      const response = await get<{ running: ClockodoEntry | null }>(
        "/v2/clock"
      );
      return response.running ?? null;
    },
    async getClockOptionsRights(userId: number): Promise<{
      customers: ClockodoRights;
      services: ClockodoRights;
    }> {
      const [customerAccess, serviceAccess] = await Promise.all([
        get<{ add: ClockodoRights }>(
          `/v2/users/${userId}/access/customers-projects`
        ),
        get<{ add: ClockodoRights }>(`/v2/users/${userId}/access/services`),
      ]);
      return { customers: customerAccess.add, services: serviceAccess.add };
    },
    async startClock(input: {
      userId: number;
      customerId: number;
      serviceId: number;
      text?: string;
    }): Promise<ClockodoEntry> {
      const response = await requestJson<{ running: ClockodoEntry }>(
        "/v2/clock",
        {
          method: "POST",
          body: JSON.stringify({
            users_id: input.userId,
            customers_id: input.customerId,
            services_id: input.serviceId,
            text: input.text || undefined,
          }),
        }
      );
      return response.running;
    },
    async stopClock(
      entryId: number,
      userId: number
    ): Promise<ClockodoEntry | null> {
      const response = await requestJson<{
        stopped: ClockodoEntry;
        running: ClockodoEntry | null;
      }>(`/v2/clock/${entryId}?users_id=${userId}`, { method: "DELETE" });
      return response.running ?? null;
    },
    async createAbsence(input: ClockodoAbsenceInput): Promise<ClockodoAbsence> {
      const response = await requestJson<{ data: ClockodoAbsence }>(
        "/v4/absences",
        {
          method: "POST",
          body: JSON.stringify(input),
        }
      );
      return response.data;
    },
    async updateAbsence(
      id: number,
      input: Omit<ClockodoAbsenceInput, "users_id" | "status">
    ): Promise<ClockodoAbsence> {
      const response = await requestJson<{ data: ClockodoAbsence }>(
        `/v4/absences/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(input),
        }
      );
      return response.data;
    },
  };
}
