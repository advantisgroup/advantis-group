export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "bad_request",
  "conflict",
  "rate_limited",
  "upstream",
  "internal",
  "feature_disabled",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorEnvelope {
  error: string;
  code: ApiErrorCode;
  requestId: string;
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}
