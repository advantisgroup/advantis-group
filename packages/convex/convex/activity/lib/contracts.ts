import { z } from "zod";

/**
 * The wire contract between the desktop agent and the backend. The agent
 * constructs objects of this shape; the ingest endpoint re-validates with this
 * exact schema (never trust the client). Ported verbatim from ActivityTrack's
 * `@activitytrack/shared`.
 */
export const AGENT_VERSION = "0.1.0";

export const activitySampleSchema = z.object({
  deviceId: z.string().uuid(),
  windowsUser: z.string().min(1).max(256),
  hostname: z.string().min(1).max(256),
  /** Milliseconds since last input at capture time. */
  idleMs: z
    .number()
    .int()
    .nonnegative()
    .max(7 * 24 * 60 * 60 * 1000),
  active: z.boolean(),
  /** Client clock (ms epoch). */
  capturedAt: z.number().int().positive(),
  tzOffsetMinutes: z.number().int().min(-840).max(840),
  agentVersion: z.string().min(1).max(32),
  platform: z.string().min(1).max(128),
});

export type ActivitySample = z.infer<typeof activitySampleSchema>;

export const ingestPayloadSchema = z.object({
  samples: z.array(activitySampleSchema).min(1).max(500),
});
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
