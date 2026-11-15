import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ApiError, NetworkError, apiRequest } from "@/lib/api/client";

const fetchMock = vi.fn();

function installTelegram(initData: string) {
  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: { initData },
  };
}

describe("api client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("performs a GET request against the API", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ status: "ok" }),
    });

    const payload = await apiRequest<{ status: string }>("/health/live");

    expect(payload).toEqual({ status: "ok" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/health/live");
    expect(init.method).toBe("GET");
  });

  it("appends the query parameters", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "{}",
    });

    await apiRequest("/anime/search", {
      query: { query: "bebop", page: 2, empty: "", missing: undefined },
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("query=bebop");
    expect(url).toContain("page=2");
    expect(url).not.toContain("empty=");
    expect(url).not.toContain("missing=");
  });

  it("sends the Telegram init data as the authorization header", async () => {
    installTelegram("auth_date=1&hash=abc");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "{}",
    });

    await apiRequest("/auth/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("tma auth_date=1&hash=abc");
  });

  it("omits the authorization header outside of Telegram", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "{}",
    });

    await apiRequest("/auth/me");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends the body as JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      text: async () => "{}",
    });

    await apiRequest("/library", {
      method: "POST",
      body: { anime_id: "42", status: "watching" },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ anime_id: "42", status: "watching" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("raises the error of the unified envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ "X-Request-ID": "req-1" }),
      text: async () =>
        JSON.stringify({
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "Source is temporarily unavailable",
            request_id: "req-1",
          },
        }),
    });

    await expect(apiRequest("/anime/search")).rejects.toBeInstanceOf(ApiError);

    try {
      await apiRequest("/anime/search");
      expect.unreachable("the request has to fail");
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(503);
      expect(apiError.code).toBe("PROVIDER_UNAVAILABLE");
      expect(apiError.message).toBe("Source is temporarily unavailable");
      expect(apiError.requestId).toBe("req-1");
    }
  });

  it("falls back to a generic error when the body is not an envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => "boom",
    });

    await expect(apiRequest("/anime/search")).rejects.toMatchObject({
      status: 500,
      code: "HTTP_ERROR",
    });
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(apiRequest("/anime/search")).rejects.toBeInstanceOf(NetworkError);
  });

  it("returns nothing for an empty answer", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => "",
    });

    await expect(apiRequest("/library/42", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
