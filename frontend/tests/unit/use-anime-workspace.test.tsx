import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  fetchAnimeDetails: vi.fn(),
  fetchAnimeEpisodes: vi.fn(),
  fetchEpisodeSources: vi.fn(),
  fetchPlaybackOptions: vi.fn(),
  fetchLibraryEntry: vi.fn(),
  updateLibraryEntry: vi.fn(),
  addToLibrary: vi.fn(),
}));

const mockFetchAnimeDetails = mocks.fetchAnimeDetails;
const mockFetchAnimeEpisodes = mocks.fetchAnimeEpisodes;
const mockFetchEpisodeSources = mocks.fetchEpisodeSources;
const mockFetchPlaybackOptions = mocks.fetchPlaybackOptions;
const mockFetchLibraryEntry = mocks.fetchLibraryEntry;
const mockUpdateLibraryEntry = mocks.updateLibraryEntry;
const mockAddToLibrary = mocks.addToLibrary;

vi.mock("@/lib/api/endpoints", () => ({
  fetchAnimeDetails: mocks.fetchAnimeDetails,
  fetchAnimeEpisodes: mocks.fetchAnimeEpisodes,
  fetchEpisodeSources: mocks.fetchEpisodeSources,
  fetchPlaybackOptions: mocks.fetchPlaybackOptions,
  fetchLibraryEntry: mocks.fetchLibraryEntry,
  updateLibraryEntry: mocks.updateLibraryEntry,
  addToLibrary: mocks.addToLibrary,
}));

import { useAnimeWorkspace } from "@/features/anime/use-anime-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const details = {
  provider: "aniliberty",
  external_id: "8443",
  title: "Ковбой Бибоп",
  poster_url: "https://example.org/poster.jpg",
  year: 1998,
  genres: [],
  total_episodes: 2,
  release_status: "completed",
  available_providers: ["aniliberty"],
};

const episodes = [
  {
    id: "ep-1",
    number: 1,
    title: "Первый",
    is_available: true,
    provider: "aniliberty",
    anime_external_id: "8443",
    external_id: "ep-1",
  },
  {
    id: "ep-2",
    number: 2,
    title: "Второй",
    is_available: true,
    provider: "aniliberty",
    anime_external_id: "8443",
    external_id: "ep-2",
  },
];

const sources = [
  {
    provider: "aniliberty",
    key: "source-1",
    title: "Озвучка 1",
    player: "kodik",
  },
  {
    provider: "aniliberty",
    key: "source-2",
    title: "Озвучка 2",
    player: "kodik",
  },
];

describe("useAnimeWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAnimeDetails.mockResolvedValue(details);
    mockFetchAnimeEpisodes.mockResolvedValue({
      items: episodes,
      page: 1,
      pageSize: 100,
      total: 2,
    });
    mockFetchEpisodeSources.mockResolvedValue(sources);
    mockFetchPlaybackOptions.mockResolvedValue([
      {
        provider: "aniliberty",
        source_key: "source-1",
        source_title: "Озвучка 1",
        kind: "hls",
        quality: 720,
        url: "https://example.org/master.m3u8",
        headers: {},
      },
    ]);
    mockFetchLibraryEntry.mockRejectedValue(new Error("NOT_FOUND"));
    mockUpdateLibraryEntry.mockResolvedValue({});
    mockAddToLibrary.mockResolvedValue({});
  });

  it("selects the first episode and the first source", async () => {
    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.episodes).toHaveLength(2));

    await waitFor(() => expect(result.current.selectedEpisodeId).toBe("ep-1"));
    await waitFor(() => expect(result.current.selectedSourceKey).toBe("source-1"));
    expect(result.current.currentOption?.url).toBe(
      "https://example.org/master.m3u8",
    );
  });

  it("resumes the episode the user watched last", async () => {
    mockFetchLibraryEntry.mockResolvedValue({
      id: "lib-1",
      user_id: "user-1",
      anime_id: "uuid-1",
      status: "watching",
      progress_episode: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      anime: details,
    });

    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.selectedEpisodeId).toBe("ep-2"));
  });

  it("resets the source when the episode changes", async () => {
    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.selectedSourceKey).toBe("source-1"));

    act(() => result.current.selectEpisode("ep-2"));

    await waitFor(() =>
      expect(mockFetchEpisodeSources).toHaveBeenCalledWith("ep-2", expect.anything()),
    );
  });

  it("adds the title when the status changes and it is not in the library", async () => {
    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    await act(async () => {
      await result.current.changeStatus("watching");
    });

    expect(mockAddToLibrary).toHaveBeenCalledWith(
      "uuid-1",
      "watching",
      undefined,
    );
  });

  it("adds the title to the library when it is not there yet", async () => {
    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    await act(async () => {
      await result.current.addToLibrary();
    });

    expect(mockAddToLibrary).toHaveBeenCalledWith(
      "uuid-1",
      "plan_to_watch",
      undefined,
    );
  });

  it("updates the status of an existing entry", async () => {
    mockFetchLibraryEntry.mockResolvedValue({
      id: "lib-1",
      user_id: "user-1",
      anime_id: "uuid-1",
      status: "watching",
      progress_episode: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      anime: details,
    });

    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.libraryEntry).not.toBeNull());

    await act(async () => {
      await result.current.changeStatus("completed");
    });

    expect(mockUpdateLibraryEntry).toHaveBeenCalledWith("uuid-1", {
      status: "completed",
    });
  });

  it("marks the title as watched when the progress grows", async () => {
    mockFetchLibraryEntry.mockResolvedValue({
      id: "lib-1",
      user_id: "user-1",
      anime_id: "uuid-1",
      status: "plan_to_watch",
      progress_episode: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      anime: details,
    });

    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.libraryEntry).not.toBeNull());

    await act(async () => {
      await result.current.changeProgress(5);
    });

    expect(mockUpdateLibraryEntry).toHaveBeenCalledWith("uuid-1", {
      progress_episode: 5,
    });
    expect(mockUpdateLibraryEntry).toHaveBeenCalledWith("uuid-1", {
      status: "watching",
    });
  });

  it("reports the error of the details request", async () => {
    mockFetchAnimeDetails.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useAnimeWorkspace("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});

describe("useDebouncedValue", () => {
  it("reports the value after the delay", async () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 300),
        { initialProps: { value: "a" } },
      );

      expect(result.current).toBe("a");

      rerender({ value: "ab" });
      expect(result.current).toBe("a");

      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current).toBe("ab");
    } finally {
      vi.useRealTimers();
    }
  });
});
