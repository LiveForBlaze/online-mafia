// Thin fetch wrapper for our backend API.
//
// All requests:
//   - go to ${VITE_BACKEND_URL}${path}
//   - include credentials (cookies) so the session cookie is sent and received
//   - send JSON by default
//
// On non-2xx responses, the wrapper throws an `ApiError` carrying the parsed JSON body.
// Routes that return 204 No Content resolve to `undefined`.

import { env } from './env.js';

export interface ApiErrorBody {
  error?: string;
  details?: unknown;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
  const method = options.method ?? 'GET';
  const url = `${env.VITE_BACKEND_URL}${path}`;

  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  let data: unknown;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      // The backend always returns JSON; a non-JSON body means an upstream proxy
      // or infrastructure error. Surface a clean ApiError instead of letting the
      // SyntaxError escape as an unhandled rejection.
      throw new ApiError(response.ok ? 502 : response.status, {
        error: response.ok
          ? 'invalid_json_response'
          : `Request failed with status ${response.status}`,
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, (data ?? {}) as ApiErrorBody);
  }

  return data as TResponse;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PUT', body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PATCH', body, signal }),
  delete: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'DELETE', body, signal }),
};
