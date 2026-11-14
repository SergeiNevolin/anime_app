"use client";

import { useQuery } from "@tanstack/react-query";

import { searchAnime } from "@/lib/api/endpoints";

export const animeSearchQueryKey = ["anime", "search"] as const;

/**
 * Search the catalogue.
 *
 * The query is only executed when the term is long enough to be meaningful,
 * which keeps the request rate low.
 */
export function useAnimeSearch(
  query: string,
  options: { page?: number; pageSize?: number; enabled?: boolean } = {},
) {
  const { page = 1, pageSize = 20, enabled = true } = options;
  const term = query.trim();

  return useQuery({
    queryKey: [...animeSearchQueryKey, term, page, pageSize],
    queryFn: ({ signal }) =>
      searchAnime(term, { page, pageSize }, { signal }),
    enabled: enabled && term.length >= 2,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}
