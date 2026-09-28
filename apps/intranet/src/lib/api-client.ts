"use client";

import { useMemo } from "react";

import { useAuth } from "@clerk/nextjs";

import { apiBaseUrl, type EdenApiClient, useEdenApi } from "@/lib/eden";
import { parseError, type ErrorCode } from "@/lib/errors";

interface ApiResult<T> {
  data?: T | null;
  error?: unknown;
}

export class ApiResponseError extends Error {
  readonly code?: ErrorCode;
  readonly requestId?: string;

  constructor(error: unknown) {
    const parsed = parseError(error);
    super("The request could not be completed.");
    this.name = "ApiResponseError";
    this.code = parsed.code;
    this.requestId = parsed.requestId;
  }
}

export async function unwrapApiResult<T>(result: Promise<ApiResult<T>>): Promise<T> {
  const { data, error } = await result;
  if (error) throw new ApiResponseError(error);
  if (data === undefined || data === null) throw new ApiResponseError(undefined);
  return data;
}

export class IntranetApiClient {
  constructor(
    readonly eden: EdenApiClient,
    private readonly getToken: () => Promise<string | null>,
  ) {}

  async unwrap<T>(result: Promise<ApiResult<T>>): Promise<T> {
    return unwrapApiResult(result);
  }

  async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: await this.headers(init?.headers),
    });
    return this.readJson<T>(response);
  }

  /** For files an `<img>` can't load itself because they need the token. */
  async fetchBlob(path: string): Promise<Blob> {
    const response = await fetch(`${apiBaseUrl}${path}`, { headers: await this.headers() });
    if (!response.ok) throw new ApiResponseError(undefined);
    return response.blob();
  }

  async uploadForm<T>(
    path: string,
    form: FormData,
    onProgress?: (fraction: number) => void,
  ): Promise<T> {
    const token = await this.getToken();
    return new Promise<T>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${apiBaseUrl}${path}`);
      if (token) request.setRequestHeader("authorization", `Bearer ${token}`);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      request.onload = () => {
        let payload: unknown;
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          payload = undefined;
        }
        if (request.status >= 200 && request.status < 300) {
          resolve(payload as T);
        } else {
          reject(new ApiResponseError(payload));
        }
      };
      request.onerror = () => reject(new ApiResponseError(undefined));
      request.send(form);
    });
  }

  async headers(extra?: HeadersInit): Promise<Headers> {
    const headers = new Headers(extra);
    const token = await this.getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    return headers;
  }

  private async readJson<T>(response: Response): Promise<T> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok) throw new ApiResponseError(payload);
    return payload as T;
  }
}

export function useIntranetApiClient(): IntranetApiClient {
  const eden = useEdenApi();
  const { getToken } = useAuth();
  return useMemo(() => new IntranetApiClient(eden, getToken), [eden, getToken]);
}
