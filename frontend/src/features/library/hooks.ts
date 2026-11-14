"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addToLibrary,
  fetchContinueWatching,
  fetchLibrary,
  removeFromLibrary,
  updateLibraryEntry,
} from "@/lib/api/endpoints";
import type { LibraryStatus } from "@/lib/api/types";

export const libraryQueryKey = ["library"] as const;
export const continueWatchingQueryKey = ["library", "continue"] as const;

/** Return the personal library. */
export function useLibrary(status: LibraryStatus | null = null) {
  return useQuery({
    queryKey: [...libraryQueryKey, status ?? "all"],
    queryFn: ({ signal }) => fetchLibrary({ status }, { signal }),
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
    }: {
      animeId: string;
      status?: LibraryStatus;
    }) => addToLibrary(animeId, status),
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
