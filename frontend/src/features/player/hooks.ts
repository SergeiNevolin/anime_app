"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchEpisodeSources, fetchPlaybackOptions } from "@/lib/api/endpoints";

export const episodeSourcesQueryKey = ["episodes", "sources"] as const;
export const playbackOptionsQueryKey = ["episodes", "playback"] as const;

/** Return the playable sources of an episode. */
export function useEpisodeSources(episodeId: string | null) {
  return useQuery({
    queryKey: [...episodeSourcesQueryKey, episodeId],
    queryFn: ({ signal }) => fetchEpisodeSources(episodeId as string, { signal }),
    enabled: Boolean(episodeId),
    staleTime: 60_000,
  });
}

/**
 * Resolve the playable streams of a source.
 *
 * The links are temporary, therefore they are never cached: they are fetched
 * right before the playback starts.
 */
export function usePlaybackOptions(
  episodeId: string | null,
  sourceKey: string | null,
) {
  return useQuery({
    queryKey: [...playbackOptionsQueryKey, episodeId, sourceKey],
    queryFn: ({ signal }) =>
      fetchPlaybackOptions(episodeId as string, sourceKey as string, { signal }),
    enabled: Boolean(episodeId) && Boolean(sourceKey),
    staleTime: 0,
    gcTime: 0,
    retry: 0,
  });
}
