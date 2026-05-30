import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// env.js validates import.meta.env with zod (.url()) at import time, which would
// throw in the node test runner where VITE_BACKEND_URL is unset. Provide a fixed
// value so the wrapper builds a deterministic URL.
vi.mock('./env.js', () => ({
  env: { VITE_BACKEND_URL: 'https://api.test', VITE_LIVEKIT_URL: 'wss://lk.test' },
}));

import { ApiError, apiClient } from './api-client.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function rawResponse(status: number, text: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

describe('apiClient / request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses and returns a 200 JSON body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, { id: 7, name: 'a' }));

    const result = await apiClient.get<{ id: number; name: string }>('/users/7');

    expect(result).toEqual({ id: 7, name: 'a' });
  });

  it('prefixes the path with VITE_BACKEND_URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {}));

    await apiClient.get('/lobbies');

    expect(fetch).toHaveBeenCalledWith('https://api.test/lobbies', expect.any(Object));
  });

  it('returns undefined for a 204 No Content without calling text()', async () => {
    const text = vi.fn();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 204,
      ok: true,
      text,
    } as unknown as Response);

    const result = await apiClient.delete('/session');

    expect(result).toBeUndefined();
    expect(text).not.toHaveBeenCalled();
  });

  it('throws an ApiError carrying status and parsed body on a non-2xx response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(422, { error: 'invalid', details: { field: 'name' } }),
    );

    const err = await apiClient.post('/lobbies', { name: '' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.body).toEqual({ error: 'invalid', details: { field: 'name' } });
    expect(apiErr.message).toBe('invalid');
  });

  it('throws an ApiError (not a raw SyntaxError) when an error body is non-JSON', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      rawResponse(503, '<html>502 Bad Gateway</html>'),
    );

    const err = await apiClient.get('/health').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as Error).name).not.toBe('SyntaxError');
  });

  it('maps a non-JSON 200 body to a 502 ApiError (invalid_json_response)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(rawResponse(200, '<html>proxy</html>'));

    const err = await apiClient.get('/data').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).body.error).toBe('invalid_json_response');
  });

  it('always sends credentials: "include"', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {}));

    await apiClient.get('/auth/me');

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('sets Content-Type and serializes the body only when a body is present', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {}));

    await apiClient.post('/lobbies', { name: 'Table 1' });

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ name: 'Table 1' }));
  });

  it('omits Content-Type and body for a GET without a body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {}));

    await apiClient.get('/lobbies');

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('forwards an AbortSignal through to fetch', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {}));
    const controller = new AbortController();

    await apiClient.get('/lobbies', controller.signal);

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});
