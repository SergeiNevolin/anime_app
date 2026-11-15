"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addToLibrary,
  fetchContinueWatching,
  fetchLibrary,
  fetchLibraryEntry,
  removeFromLibrary,
  updateLibraryEntry,
} from "@/lib/api/endpoints";
import type { LibraryStatus } from "@/lib/api/types";

export const libraryQueryKey = ["library"] as const;
export const continueWatchingQueryKey = ["library", "continue"] as const;

/**
 * Return the library entry of a single anime.
 *
 * A missing entry is not an error: the anime is simply not in the library
 * yet, which is the normal state on the anime page.
 */
export function useLibraryEntry(animeId: string | null) {
  return useQuery({
    queryKey: [...libraryQueryKey, "entry", animeId],
    queryFn: ({ signal }) => fetchLibraryEntry(animeId as string, { signal }),
    enabled: Boolean(animeId),
    retry: false,
    staleTime: 30_000,
  });
}

/** Return the personal library. */
export function useLibrary(
  status: LibraryStatus | null = null,
  options: { page?: number; pageSize?: number } = {},
) {
  const { page = 1, pageSize = 20 } = options;
  return useQuery({
    queryKey: [...libraryQueryKey, status ?? "all", page, pageSize],
    queryFn: ({ signal }) => fetchLibrary({ status, page, pageSize }, { signal }),
    staleTime: 30_000,
  });
}

/** Return the titles the user started to watch. */
export function useContinueWatching() {
  return useQuery({
    queryKey: continueWatchingQueryKey,
    queryFn: ({ signal }) => fetchContinueWatching({ signal }),
    staleTime: 30_000,
  });
}

/** Add an anime to the library. */
export function useAddToLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      animeId,
      status,
      progressEpisode,
    }: {
      animeId: string;
      status?: LibraryStatus;
      progressEpisode?: number;
    }) => addToLibrary(animeId, status, progressEpisode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryQueryKey });
      void queryClient.invalidateQueries({ queryKey: continueWatchingQueryKey });
    },
  });
}

/** Update the status or the progress of a library entry. */
export function useUpdateLibraryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      animeId,
      status,
      progressEpisode,
    }: {
      animeId: string;
      status?: LibraryStatus;
      progressEpisode?: number;
    }) =>
      updateLibraryEntry(animeId, {
        ...(status ? { status } : {}),
        ...(progressEpisode !== undefined
          ? { progress_episode: progressEpisode }
          : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryQueryKey });
      void queryClient.invalidateQueries({ queryKey: continueWatchingQueryKey });
    },
  });
}

/** Remove an anime from the library. */
export function useRemoveFromLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ animeId }: { animeId: string }) =>
      removeFromLibrary(animeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryQueryKey });
      void queryClient.invalidateQueries({ queryKey: continueWatchingQueryKey });
    },
  });
}
