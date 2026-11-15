"use client";

import { useQuery } from "@tanstack/react-query";

import { searchAnime, fetchProviders } from "@/lib/api/endpoints";
import type { ProviderInfo } from "@/lib/api/types";

export const animeSearchQueryKey = ["anime", "search"] as const;
export const providersQueryKey = ["providers"] as const;

/**
 * Search the catalogue.
 *
 * The query is only executed when the term is long enough to be meaningful,
 * which keeps the request rate low.
 */
export function useAnimeSearch(
  query: string,
  options: { page?: number; pageSize?: number; provider?: string; enabled?: boolean } = {},
) {
  const { page = 1, pageSize = 20, provider, enabled = true } = options;
  const term = query.trim();

  return useQuery({
    queryKey: [...animeSearchQueryKey, term, page, pageSize, provider],
    queryFn: ({ signal }) =>
      searchAnime(term, { page, pageSize, provider }, { signal }),
    enabled: enabled && term.length >= 2,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Get the list of catalog providers that support search.
 */
export function useProviders() {
  return useQuery({
    queryKey: providersQueryKey,
    queryFn: ({ signal }) => fetchProviders({ signal }),
    staleTime: 5 * 60_000,
    select: (data): ProviderInfo[] =>
      data.filter((p) => p.kind === "catalog" && p.supports_search && p.enabled),
  });
}
