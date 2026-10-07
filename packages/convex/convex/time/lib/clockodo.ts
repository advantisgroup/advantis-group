import { addDays, berlinDate, isIsoDate } from "./berlin";

/**
 * Turns a Clockodo export (the JSON the admin downloads from Clockodo's own
 * API, see docs/future-features/04a_zeiterfassung-spec.md) into one import
 * plan per Clockodo person. Pure, so the intranet can show the preview and
 * the server can trust nothing but the shape it receives.
 */

export interface ClockodoExport {
  exportedAt: string;
  users: {
    id: number;
    name: string;
    email: string;
    active: boolean;
    start_date?: string | null;
    exit_date?: string | null;
  }[];
  targethours: Record<
    string,
    {
      type: string;
      date_since: string;
      date_until: string | null;
      monday: number;
      tuesday: number;
      wednesday: number;
      thursday: number;
      friday: number;
      saturday: number;
      sunday: number;
    }[]
  >;
  userReports: Record<
    string,
    {
      users_id: number;
      report_data: { balance: number; holidays_quota: number; holidays_carry: number } | null;
    }[]
  >;
  absences: {
    id: number;
    users_id: number;
    date_since: string;
    date_until: string;
    type: number;
    status: number;
    note: string | null;
    public_note?: string | null;
    count_days: number | null;
    count_hours?: number | null;
  }[];
  entries: {
    id: number;
    users_id: number;
    type: number;
    time_since: string;
    time_until: string | null;
    text: string | null;
  }[];
}

export type ImportAbsenceType = "vacation" | "sick" | "special" | "overtime" | "other";
export type ImportAbsenceStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ImportEntry {
  importId: string;
  start: number;
  end: number;
  note?: string;
}

export interface ImportAbsence {
  importId: string;
  type: ImportAbsenceType;
  status: ImportAbsenceStatus;
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  note?: string;
}

export interface ImportSchedule {
  validFrom: string;
  minutesPerWeekday: number[];
}

export interface PersonPlan {
  clockodoId: number;
  name: string;
  email: string;
  active: boolean;
  schedules: ImportSchedule[];
  /** Entitlement of the export year as Clockodo has it; null if no report. */
  allowance: { year: number; days: number; carriedOver: number } | null;
  /** Clockodo's hours-account balance in the export year, in minutes. */
  balanceMinutes: number | null;
  lastEntryDate: string | null;
  entries: ImportEntry[];
  absences: ImportAbsence[];
  /** Things the admin should look at before importing. */
  warnings: string[];
}

export interface ImportPlan {
  exportDate: string;
  year: number;
  people: PersonPlan[];
}

/** Clockodo absence types 1–5; everything else becomes "other". */
const TYPE: Record<number, ImportAbsenceType> = {
  1: "vacation",
  2: "special",
  3: "overtime",
  4: "sick",
  5: "sick",
};

/** 0 requested, 1 approved, 2 declined, 3 approval cancelled, 4 request cancelled. */
const STATUS: Record<number, ImportAbsenceStatus> = {
  0: "pending",
  1: "approved",
  2: "rejected",
  3: "cancelled",
  4: "cancelled",
};

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function schedulesOf(rows: ClockodoExport["targethours"][string], warnings: string[]) {
  const weekly = rows
    .filter((row) => {
      if (row.type === "weekly") return true;
      warnings.push(`Sollzeit-Modell „${row.type}“ ab ${row.date_since} nicht übernommen`);
      return false;
    })
    .sort((a, b) => a.date_since.localeCompare(b.date_since));
  const out: ImportSchedule[] = [];
  weekly.forEach((row, index) => {
    out.push({
      validFrom: row.date_since,
      minutesPerWeekday: DAYS.map((day) => Math.round((row[day] ?? 0) * 60)),
    });
    const next = weekly[index + 1];
    // A model that ends without a successor (e.g. someone who left): no
    // target hours after it.
    if (row.date_until && (!next || next.date_since > addDays(row.date_until, 1))) {
      out.push({ validFrom: addDays(row.date_until, 1), minutesPerWeekday: [0, 0, 0, 0, 0, 0, 0] });
    }
  });
  // Keep the newest model per start date.
  const byDate = new Map(out.map((row) => [row.validFrom, row]));
  return [...byDate.values()].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
}

function absenceOf(row: ClockodoExport["absences"][number]): ImportAbsence {
  const type = TYPE[row.type] ?? "other";
  const half = row.count_days !== null && Math.abs((row.count_days % 1) - 0.5) < 1e-9;
  const single = row.date_since === row.date_until;
  const notes = [
    row.note,
    row.public_note,
    type === "other" ? `Clockodo-Abwesenheitsart ${row.type}` : null,
    row.type === 3 && row.count_hours ? `${row.count_hours} h` : null,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return {
    importId: `clockodo:absence:${row.id}`,
    type,
    status: STATUS[row.status] ?? "pending",
    startDate: row.date_since,
    endDate: row.date_until,
    halfDayStart: half && single,
    halfDayEnd: half && !single,
    note: notes.length > 0 ? notes.join(" · ") : undefined,
  };
}

export function planClockodoImport(data: ClockodoExport): ImportPlan {
  const exportedAt = Date.parse(data.exportedAt);
  const exportDate = berlinDate(Number.isFinite(exportedAt) ? exportedAt : Date.now());
  const year = Number(exportDate.slice(0, 4));
  const reports = new Map(
    (data.userReports[String(year)] ?? []).map((row) => [row.users_id, row.report_data]),
  );

  const people = data.users.map((user): PersonPlan => {
    const warnings: string[] = [];
    const entries: ImportEntry[] = [];
    let running = 0;
    let lastEntryDate: string | null = null;
    for (const row of data.entries) {
      if (row.users_id !== user.id) continue;
      if (!row.time_until) {
        running += 1;
        continue;
      }
      const start = Date.parse(row.time_since);
      const end = Date.parse(row.time_until);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      entries.push({
        importId: `clockodo:entry:${row.id}`,
        start,
        end,
        note: row.text?.trim() || undefined,
      });
      const day = berlinDate(start);
      if (!lastEntryDate || day > lastEntryDate) lastEntryDate = day;
    }
    entries.sort((a, b) => a.start - b.start);
    if (running > 0) warnings.push(`${running} laufende Stempelung nicht übernommen`);

    const report = reports.get(user.id) ?? null;
    const absences = data.absences
      .filter((row) => row.users_id === user.id)
      .filter((row) => isIsoDate(row.date_since) && isIsoDate(row.date_until))
      .map(absenceOf);
    const schedules = schedulesOf(data.targethours[String(user.id)] ?? [], warnings);
    if (schedules.length === 0) warnings.push("Keine Sollzeit in Clockodo");
    if (report && entries.length === 0 && report.balance !== 0) {
      warnings.push("Stempelt nicht in Clockodo – Saldo ist nur Minus aus Sollzeit");
    }

    return {
      clockodoId: user.id,
      name: user.name.replace(/\./g, " ").trim(),
      email: user.email,
      active: user.active,
      schedules,
      allowance: report
        ? { year, days: report.holidays_quota, carriedOver: report.holidays_carry }
        : null,
      balanceMinutes: report ? Math.round(report.balance / 60) : null,
      lastEntryDate,
      entries,
      absences,
      warnings,
    };
  });

  return { exportDate, year, people };
}

/** Lower-case letters only, umlauts and ß spelled out — for name matching. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * Best intranet match for a Clockodo person: the stored Clockodo id first,
 * then the e-mail, then first + last name in either order.
 */
export function matchIntranetUser<
  T extends { userId: string; name: string; email: string; clockodoUserId?: string | null },
>(person: Pick<PersonPlan, "clockodoId" | "name" | "email">, users: readonly T[]): T | null {
  const byId = users.find(
    (user) => String(user.clockodoUserId ?? "") === String(person.clockodoId),
  );
  if (byId) return byId;
  const email = person.email.toLowerCase();
  const byEmail = users.find((user) => user.email.toLowerCase() === email);
  if (byEmail) return byEmail;
  const words = normalizeName(person.name).split(" ").filter(Boolean);
  if (words.length < 2) return null;
  const key = [...words].sort().join(" ");
  const matches = users.filter(
    (user) => normalizeName(user.name).split(" ").filter(Boolean).sort().join(" ") === key,
  );
  return matches.length === 1 ? matches[0] : null;
}
