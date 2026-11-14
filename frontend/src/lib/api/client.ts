/**
 * The single HTTP client of the application.
 *
 * Every request to the backend goes through this module: the components
 * never call `fetch` themselves.  The Telegram `initData` is attached as the
 * `Authorization: tma <initData>` header, exactly like the Telegram Mini App
 * documentation requires.
 */

import { getInitData, useDevAuth, getDevAuthCredential } from "@/lib/telegram/webapp";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export interface ApiErrorPayload {
  code: string;
  message: string;
  request_id: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code;
    this.requestId = payload.request_id;
  }
}

export class NetworkError extends Error {
  constructor(message = "The server is unreachable") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `${url}?${serialized}` : url;
}

function buildHeaders(hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  
  // Use dev auth when enabled and no real initData
  if (useDevAuth()) {
    headers.Authorization = `dev ${getDevAuthCredential()}`;
  } else {
    const initData = getInitData();
    if (initData) {
      headers.Authorization = `tma ${initData}`;
    }
  }
  
  return headers;
}

/**
 * Perform a request against the backend and return the parsed payload.
 *
 * @throws {ApiError} when the backend answers with an error envelope.
 * @throws {NetworkError} when the request could not be performed at all.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers: buildHeaders(hasBody),
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new NetworkError(error instanceof Error ? error.message : undefined);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error: ApiErrorPayload }).error
        : {
            code: "HTTP_ERROR",
            message: `Request failed with status ${response.status}`,
            request_id: response.headers.get("X-Request-ID") ?? "",
          };
    throw new ApiError(response.status, errorPayload);
  }

  return payload as T;
}
