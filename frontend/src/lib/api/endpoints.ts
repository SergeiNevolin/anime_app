/**
 * Typed wrappers around the backend endpoints.
 *
 * The functions validate the answer with Zod before returning it, so a
 * broken or outdated backend produces a readable error instead of an
 * undefined property access in a component.
 */

import { apiRequest, type RequestOptions } from "@/lib/api/client";
import {
  animeDetailsSchema,
  animeEpisodePageSchema,
  animeSummaryPageSchema,
  episodeSourceListSchema,
  libraryItemPageSchema,
  libraryItemSchema,
  playbackOptionListSchema,
  providerInfoListSchema,
  userSchema,
} from "@/lib/api/schemas";
import type {
  AnimeDetails,
  AnimeEpisode,
  AnimeSummary,
  EpisodeSource,
  LibraryItem,
  LibraryStatus,
  PlaybackOption,
  ProviderInfo,
  User,
} from "@/lib/api/types";

export async function fetchCurrentUser(
  options?: RequestOptions,
): Promise<User> {
  const payload = await apiRequest<unknown>("/auth/me", options);
  return userSchema.parse(payload);
}

export async function searchAnime(
  query: string,
  params: { page?: number; pageSize?: number } = {},
  options?: RequestOptions,
): Promise<{ items: AnimeSummary[]; page: number; pageSize: number; total: number | null; hasMore: boolean }> {
  const payload = await apiRequest<unknown>("/anime/search", {
    ...options,
    query: {
      query,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
  const parsed = animeSummaryPageSchema.parse(payload);
  return {
    items: parsed.items as AnimeSummary[],
    page: parsed.page,
    pageSize: parsed.page_size,
    total: parsed.total ?? null,
    hasMore: parsed.has_more ?? false,
  };
}

export async function fetchAnimeDetails(
  animeId: string,
  options?: RequestOptions,
): Promise<AnimeDetails> {
  const payload = await apiRequest<unknown>(`/anime/${animeId}`, options);
  return animeDetailsSchema.parse(payload) as AnimeDetails;
}

export async function fetchAnimeEpisodes(
  animeId: string,
  params: { page?: number; pageSize?: number } = {},
  options?: RequestOptions,
): Promise<{ items: AnimeEpisode[]; page: number; pageSize: number; total: number | null }> {
  const payload = await apiRequest<unknown>(`/anime/${animeId}/episodes`, {
    ...options,
    query: { page: params.page ?? 1, page_size: params.pageSize ?? 100 },
  });
  const parsed = animeEpisodePageSchema.parse(payload);
  return {
    items: parsed.items as AnimeEpisode[],
    page: parsed.page,
    pageSize: parsed.page_size,
    total: parsed.total ?? null,
  };
}

export async function fetchEpisodeSources(
  episodeId: string,
  options?: RequestOptions,
): Promise<EpisodeSource[]> {
  const payload = await apiRequest<unknown>(
    `/episodes/${encodeURIComponent(episodeId)}/sources`,
    options,
  );
  return episodeSourceListSchema.parse(payload) as EpisodeSource[];
}

export async function fetchPlaybackOptions(
  episodeId: string,
  sourceKey: string,
  options?: RequestOptions,
): Promise<PlaybackOption[]> {
  const payload = await apiRequest<unknown>(
    `/episodes/${encodeURIComponent(episodeId)}/sources/${encodeURIComponent(sourceKey)}/playback`,
    options,
  );
  return playbackOptionListSchema.parse(payload) as PlaybackOption[];
}

export async function fetchLibrary(
  params: { status?: LibraryStatus | null; page?: number; pageSize?: number } = {},
  options?: RequestOptions,
): Promise<{ items: LibraryItem[]; page: number; pageSize: number; total: number | null }> {
  const payload = await apiRequest<unknown>("/library", {
    ...options,
    query: {
      status: params.status ?? undefined,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    },
  });
  const parsed = libraryItemPageSchema.parse(payload);
  return {
    items: parsed.items as LibraryItem[],
    page: parsed.page,
    pageSize: parsed.page_size,
    total: parsed.total ?? null,
  };
}

export async function fetchContinueWatching(
  options?: RequestOptions,
): Promise<LibraryItem[]> {
  const payload = await apiRequest<unknown>("/library/continue", options);
  return libraryItemPageSchema.shape.items.parse(payload) as LibraryItem[];
}

export async function addToLibrary(
  animeId: string,
  status: LibraryStatus = "plan_to_watch",
  options?: RequestOptions,
): Promise<LibraryItem> {
  const payload = await apiRequest<unknown>("/library", {
    ...options,
    method: "POST",
    body: { anime_id: animeId, status },
  });
  return libraryItemSchema.parse(payload) as LibraryItem;
}

export async function updateLibraryEntry(
  animeId: string,
  payload: { status?: LibraryStatus; progress_episode?: number },
  options?: RequestOptions,
): Promise<LibraryItem> {
  const response = await apiRequest<unknown>(`/library/${animeId}`, {
    ...options,
    method: "PATCH",
    body: payload,
  });
  return libraryItemSchema.parse(response) as LibraryItem;
}

export async function removeFromLibrary(
  animeId: string,
  options?: RequestOptions,
): Promise<void> {
  await apiRequest<void>(`/library/${animeId}`, { ...options, method: "DELETE" });
}

export async function fetchProviders(options?: RequestOptions): Promise<ProviderInfo[]> {
  const payload = await apiRequest<unknown>("/providers", options);
  return providerInfoListSchema.parse(payload) as ProviderInfo[];
}
