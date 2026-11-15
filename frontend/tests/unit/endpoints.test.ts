import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  addToLibrary,
  fetchAnimeDetails,
  fetchAnimeEpisodes,
  fetchContinueWatching,
  fetchCurrentUser,
  fetchEpisodeSources,
  fetchLibrary,
  fetchLibraryEntry,
  fetchPlaybackOptions,
  fetchProviders,
  removeFromLibrary,
  searchAnime,
  updateLibraryEntry,
} from "@/lib/api/endpoints";

const fetchMock = vi.fn();

function respond(payload: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status < 400,
    status,
    headers: new Headers(),
    text: async () => JSON.stringify(payload),
  });
}

const animeSummary = {
  provider: "aniliberty",
  external_id: "8443",
  title: "Ковбой Бибоп",
  original_title: null,
  alternative_title: null,
  alternative_titles: [],
  poster_url: null,
  year: 1998,
  genres: [{ name: "Комедия" }],
  total_episodes: 26,
  release_status: "completed",
  external_url: null,
  description: null,
  dubbing_teams: [],
  anime_id: "uuid-1",
};

const libraryItem = {
  id: "lib-1",
  user_id: "user-1",
  anime_id: "uuid-1",
  status: "watching",
  progress_episode: 3,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  anime: animeSummary,
};

describe("API endpoints", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the current user", async () => {
    respond({
      id: "user-1",
      telegram_id: 42,
      username: "ivan",
      first_name: "Иван",
      language_code: "ru",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      last_seen_at: "2026-01-01T00:00:00Z",
    });

    const user = await fetchCurrentUser();

    expect(user.telegram_id).toBe(42);
  });

  it("searches the catalogue", async () => {
    respond({
      items: [animeSummary],
      page: 1,
      page_size: 20,
      total: 1,
      has_more: false,
    });

    const result = await searchAnime("bebop", { page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it("returns the details of a title", async () => {
    respond({ ...animeSummary, available_providers: ["aniliberty"] });

    const details = await fetchAnimeDetails("uuid-1");

    expect(details.title).toBe("Ковбой Бибоп");
    expect(details.available_providers).toEqual(["aniliberty"]);
  });

  it("returns the episodes of a title", async () => {
    respond({
      items: [
        {
          provider: "aniliberty",
          anime_external_id: "8443",
          external_id: "ep-1",
          number: 1,
          title: "Первый",
          is_available: true,
          id: "episode-1",
        },
      ],
      page: 1,
      page_size: 100,
      total: 1,
    });

    const result = await fetchAnimeEpisodes("uuid-1");

    expect(result.items[0]?.number).toBe(1);
    expect(result.total).toBe(1);
  });

  it("returns the sources of an episode", async () => {
    respond([
      {
        provider: "aniliberty",
        key: "source-1",
        title: "Озвучка",
        player: "kodik",
        external_url: null,
        official_url: null,
      },
    ]);

    const sources = await fetchEpisodeSources("episode-1");

    expect(sources[0]?.key).toBe("source-1");
  });

  it("returns the playback options of a source", async () => {
    respond([
      {
        provider: "aniliberty",
        source_key: "source-1",
        source_title: "Озвучка",
        kind: "hls",
        quality: 720,
        url: "https://example.org/master.m3u8",
        headers: {},
        official_url: null,
      },
    ]);

    const options = await fetchPlaybackOptions("episode-1", "source-1");

    expect(options[0]?.kind).toBe("hls");
    expect(options[0]?.quality).toBe(720);
  });

  it("returns the library", async () => {
    respond({
      items: [libraryItem],
      page: 1,
      page_size: 20,
      total: 1,
      has_more: false,
    });

    const result = await fetchLibrary({ status: "watching" });

    expect(result.items[0]?.status).toBe("watching");
  });

  it("returns a single library entry", async () => {
    respond(libraryItem);

    const entry = await fetchLibraryEntry("uuid-1");

    expect(entry.anime_id).toBe("uuid-1");
  });

  it("returns the titles in progress", async () => {
    respond([libraryItem]);

    const items = await fetchContinueWatching();

    expect(items).toHaveLength(1);
  });

  it("adds an anime to the library", async () => {
    respond(libraryItem, 201);

    const entry = await addToLibrary("uuid-1", "watching", 3);

    expect(entry.anime_id).toBe("uuid-1");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      anime_id: "uuid-1",
      status: "watching",
      progress_episode: 3,
    });
  });

  it("updates a library entry", async () => {
    respond(libraryItem);

    await updateLibraryEntry("uuid-1", { status: "completed" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "completed" });
  });

  it("removes an anime from the library", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => "",
    });

    await removeFromLibrary("uuid-1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });

  it("returns the registered providers", async () => {
    respond([
      {
        id: "aniliberty",
        name: "AniLiberty",
        kind: "catalog",
        enabled: true,
        supports_search: true,
        supports_episodes: true,
        supports_playback: true,
        notes: null,
      },
    ]);

    const providers = await fetchProviders();

    expect(providers[0]?.id).toBe("aniliberty");
  });

  it("rejects a payload that does not match the contract", async () => {
    respond({ items: "not-an-array" });

    await expect(fetchContinueWatching()).rejects.toThrow();
  });
});
