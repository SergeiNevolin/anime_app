import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock the endpoints directly
const mockFetchCurrentUser = vi.fn();
const mockFetchLibrary = vi.fn();
const mockFetchContinueWatching = vi.fn();
const mockSearchAnime = vi.fn();
const mockFetchAnimeDetails = vi.fn();
const mockFetchAnimeEpisodes = vi.fn();
const mockFetchEpisodeSources = vi.fn();
const mockFetchPlaybackOptions = vi.fn();
const mockAddToLibrary = vi.fn();
const mockUpdateLibraryEntry = vi.fn();
const mockRemoveFromLibrary = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  fetchCurrentUser: mockFetchCurrentUser,
  fetchLibrary: mockFetchLibrary,
  fetchContinueWatching: mockFetchContinueWatching,
  searchAnime: mockSearchAnime,
  fetchAnimeDetails: mockFetchAnimeDetails,
  fetchAnimeEpisodes: mockFetchAnimeEpisodes,
  fetchEpisodeSources: mockFetchEpisodeSources,
  fetchPlaybackOptions: mockFetchPlaybackOptions,
  addToLibrary: mockAddToLibrary,
  updateLibraryEntry: mockUpdateLibraryEntry,
  removeFromLibrary: mockRemoveFromLibrary,
}));

vi.mock("@/lib/telegram/webapp", () => ({
  getInitData: vi.fn(() => ""),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user data on success", async () => {
    const mockUser = {
      id: "123",
      telegram_id: 777000,
      username: "testuser",
      first_name: "Test",
      language_code: "ru",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    mockFetchCurrentUser.mockResolvedValue(mockUser);

    const { useCurrentUser } = await import("@/features/auth/hooks");
    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockUser);
  });

  it("handles error", async () => {
    mockFetchCurrentUser.mockRejectedValue(new Error("Unauthorized"));

    const { useCurrentUser } = await import("@/features/auth/hooks");
    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error).toBeDefined();
  });
});

describe("useLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns library items", async () => {
    const mockData = {
      items: [
        {
          id: "1",
          user_id: "123",
          anime_id: "456",
          status: "watching",
          progress_episode: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      hasMore: false,
    };
    mockFetchLibrary.mockResolvedValue(mockData);

    const { useLibrary } = await import("@/features/library/hooks");
    const { result } = renderHook(() => useLibrary(null, { page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 10000 });
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0]?.status).toBe("watching");
  });

  it("handles error", async () => {
    mockFetchLibrary.mockRejectedValue(new Error("Failed to fetch"));

    const { useLibrary } = await import("@/features/library/hooks");
    const { result } = renderHook(() => useLibrary(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10000 });
  });
});

describe("useAnimeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns search results", async () => {
    const mockData = {
      items: [
        {
          provider: "aniliberty",
          external_id: "123",
          title: "Test Anime",
          original_title: "Test Anime",
          poster_url: "https://example.com/poster.jpg",
          year: 2024,
          genres: [{ name: "Action" }],
          total_episodes: 12,
          release_status: "ongoing",
          dubbing_teams: ["Team1"],
          anime_id: "uuid-123",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      hasMore: false,
    };
    mockSearchAnime.mockResolvedValue(mockData);

    const { useAnimeSearch } = await import("@/features/search/hooks");
    const { result } = renderHook(() => useAnimeSearch("test", { page: 1, pageSize: 20, enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 10000 });
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0]?.title).toBe("Test Anime");
  });

  it("does not call API when query is too short", async () => {
    const { useAnimeSearch } = await import("@/features/search/hooks");
    renderHook(() => useAnimeSearch("a", { page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    });

    // The hook should not call the API for queries shorter than 2 characters
    await waitFor(() => expect(mockSearchAnime).not.toHaveBeenCalled(), { timeout: 1000 });
  });
});

describe("useAnimeDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns anime details", async () => {
    const mockData = {
      provider: "aniliberty",
      external_id: "123",
      title: "Test Anime",
      original_title: "Test Anime",
      poster_url: "https://example.com/poster.jpg",
      year: 2024,
      genres: [{ name: "Action" }],
      total_episodes: 12,
      release_status: "ongoing",
      description: "Test description",
      dubbing_teams: ["Team1"],
      anime_id: "uuid-123",
      available_providers: ["aniliberty"],
    };
    mockFetchAnimeDetails.mockResolvedValue(mockData);

    const { useAnimeDetails } = await import("@/features/anime/hooks");
    const { result } = renderHook(() => useAnimeDetails("uuid-123"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 10000 });
    expect(result.current.data?.title).toBe("Test Anime");
  });
});

describe("useEpisodeSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns episode sources", async () => {
    const mockData = [
      {
        provider: "aniliberty",
        key: "source-1",
        title: "Anilibria",
        player: "html5",
        external_url: "https://example.com/watch/1",
        official_url: "https://anilibria.tv",
      },
    ];
    mockFetchEpisodeSources.mockResolvedValue(mockData);

    const { useEpisodeSources } = await import("@/features/player/hooks");
    const { result } = renderHook(() => useEpisodeSources("ep-123"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 10000 });
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.title).toBe("Anilibria");
  });
});