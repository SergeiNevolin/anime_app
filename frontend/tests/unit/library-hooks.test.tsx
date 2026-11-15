import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  addToLibrary: vi.fn(),
  removeFromLibrary: vi.fn(),
  updateLibraryEntry: vi.fn(),
  fetchLibraryEntry: vi.fn(),
  fetchPlaybackOptions: vi.fn(),
  fetchEpisodeSources: vi.fn(),
  fetchLibrary: vi.fn(),
  fetchContinueWatching: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  addToLibrary: mocks.addToLibrary,
  removeFromLibrary: mocks.removeFromLibrary,
  updateLibraryEntry: mocks.updateLibraryEntry,
  fetchLibraryEntry: mocks.fetchLibraryEntry,
  fetchPlaybackOptions: mocks.fetchPlaybackOptions,
  fetchEpisodeSources: mocks.fetchEpisodeSources,
  fetchLibrary: mocks.fetchLibrary,
  fetchContinueWatching: mocks.fetchContinueWatching,
}));

import {
  useAddToLibrary,
  useLibrary,
  useLibraryEntry,
  useRemoveFromLibrary,
  useUpdateLibraryEntry,
} from "@/features/library/hooks";
import { useEpisodeSources, usePlaybackOptions } from "@/features/player/hooks";

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

describe("library hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchLibrary.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasMore: false,
    });
    mocks.fetchLibraryEntry.mockResolvedValue({
      id: "lib-1",
      user_id: "user-1",
      anime_id: "uuid-1",
      status: "watching",
      progress_episode: 3,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      anime: null,
    });
    mocks.addToLibrary.mockResolvedValue({ id: "lib-1" });
    mocks.updateLibraryEntry.mockResolvedValue({ id: "lib-1" });
    mocks.removeFromLibrary.mockResolvedValue(undefined);
  });

  it("returns the library of the user", async () => {
    const { result } = renderHook(() => useLibrary("watching", { page: 1, pageSize: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetchLibrary).toHaveBeenCalledWith(
      { status: "watching", page: 1, pageSize: 20 },
      expect.anything(),
    );
  });

  it("returns a single library entry", async () => {
    const { result } = renderHook(() => useLibraryEntry("uuid-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("watching");
  });

  it("does not query an entry without an identifier", () => {
    renderHook(() => useLibraryEntry(null), { wrapper: createWrapper() });

    expect(mocks.fetchLibraryEntry).not.toHaveBeenCalled();
  });

  it("adds an anime to the library", async () => {
    const { result } = renderHook(() => useAddToLibrary(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ animeId: "uuid-1", status: "watching" });
    });

    expect(mocks.addToLibrary).toHaveBeenCalledWith(
      "uuid-1",
      "watching",
      undefined,
    );
  });

  it("updates the status of an entry", async () => {
    const { result } = renderHook(() => useUpdateLibraryEntry(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ animeId: "uuid-1", status: "completed" });
    });

    expect(mocks.updateLibraryEntry).toHaveBeenCalledWith("uuid-1", {
      status: "completed",
    });
  });

  it("updates the progress of an entry", async () => {
    const { result } = renderHook(() => useUpdateLibraryEntry(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ animeId: "uuid-1", progressEpisode: 7 });
    });

    expect(mocks.updateLibraryEntry).toHaveBeenCalledWith("uuid-1", {
      progress_episode: 7,
    });
  });

  it("removes an anime from the library", async () => {
    const { result } = renderHook(() => useRemoveFromLibrary(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ animeId: "uuid-1" });
    });

    expect(mocks.removeFromLibrary).toHaveBeenCalledWith("uuid-1");
  });
});

describe("player hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchEpisodeSources.mockResolvedValue([]);
    mocks.fetchPlaybackOptions.mockResolvedValue([]);
  });

  it("does not query the sources without an episode", () => {
    renderHook(() => useEpisodeSources(null), { wrapper: createWrapper() });

    expect(mocks.fetchEpisodeSources).not.toHaveBeenCalled();
  });

  it("does not resolve the playback without a source", () => {
    renderHook(() => usePlaybackOptions("ep-1", null), {
      wrapper: createWrapper(),
    });

    expect(mocks.fetchPlaybackOptions).not.toHaveBeenCalled();
  });

  it("resolves the playback of a source", async () => {
    const { result } = renderHook(() => usePlaybackOptions("ep-1", "source-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetchPlaybackOptions).toHaveBeenCalledWith(
      "ep-1",
      "source-1",
      expect.anything(),
    );
  });
});
