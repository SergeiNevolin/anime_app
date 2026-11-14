"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchAnimeDetails, fetchAnimeEpisodes } from "@/lib/api/endpoints";

export const animeDetailsQueryKey = ["anime", "details"] as const;
export const animeEpisodesQueryKey = ["anime", "episodes"] as const;

/** Return the details of a catalog entry. */
export function useAnimeDetails(animeId: string | null) {
  return useQuery({
    queryKey: [...animeDetailsQueryKey, animeId],
    queryFn: ({ signal }) => fetchAnimeDetails(animeId as string, { signal }),
    enabled: Boolean(animeId),
  });
}

/** Return the episode list of a catalog entry. */
export function useAnimeEpisodes(animeId: string | null) {
  return useQuery({
    queryKey: [...animeEpisodesQueryKey, animeId],
    queryFn: ({ signal }) => fetchAnimeEpisodes(animeId as string, {}, { signal }),
    enabled: Boolean(animeId),
    staleTime: 5 * 60_000,
  });
}
