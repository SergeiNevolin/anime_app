/**
 * Types of the backend API.
 *
 * The types are generated from the OpenAPI specification of the backend, so
 * the client and the server can never drift apart.  Run `pnpm generate:api`
 * after changing the backend contract.
 */

import type { components } from "@/types/api";

export type User = components["schemas"]["User"];
export type AnimeSummary = components["schemas"]["AnimeSummary"];
export type AnimeDetails = components["schemas"]["AnimeDetails"];
export type AnimeGenre = components["schemas"]["AnimeGenre"];
export type AnimeEpisode = components["schemas"]["AnimeEpisode"];
export type EpisodeSource = components["schemas"]["EpisodeSource"];
export type PlaybackOption = components["schemas"]["PlaybackOption"];
export type PlaybackKind = components["schemas"]["PlaybackKind"];
export type LibraryItem = components["schemas"]["LibraryItem"];
export type LibraryStatus = components["schemas"]["LibraryStatus"];
export type ProviderInfo = components["schemas"]["ProviderInfo"];
export type ReleaseStatus = components["schemas"]["ReleaseStatus"];

export type PageAnimeSummary = components["schemas"]["Page_AnimeSummary_"];
export type PageAnimeEpisode = components["schemas"]["Page_AnimeEpisode_"];
export type PageLibraryItem = components["schemas"]["Page_LibraryItem_"];

export type LibraryCreateRequest = components["schemas"]["LibraryCreateRequest"];
export type LibraryUpdateRequest = components["schemas"]["LibraryUpdateRequest"];
