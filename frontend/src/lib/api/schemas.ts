/**
 * Runtime validation of the backend payloads.
 *
 * The generated TypeScript types describe the *expected* contract, the Zod
 * schemas verify that the server actually sends it.  A mismatch is reported
 * as an error instead of crashing a component.
 */

import { z } from "zod";

export const animeGenreSchema = z.object({
  name: z.string(),
  slug: z.string().nullable().optional(),
});

export const animeSummarySchema = z.object({
  provider: z.string(),
  external_id: z.string(),
  title: z.string(),
  original_title: z.string().nullable().optional(),
  alternative_title: z.string().nullable().optional(),
  alternative_titles: z.array(z.string()).default([]),
  poster_url: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  genres: z.array(animeGenreSchema).default([]),
  total_episodes: z.number().int().nullable().optional(),
  release_status: z.string().default("unknown"),
  external_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  dubbing_teams: z.array(z.string()).default([]),
  anime_id: z.string().nullable().optional(),
});

export const animeDetailsSchema = animeSummarySchema.extend({
  available_providers: z.array(z.string()).default([]),
});

export const animeEpisodeSchema = z.object({
  provider: z.string(),
  anime_external_id: z.string(),
  external_id: z.string(),
  number: z.number().int(),
  title: z.string().nullable().optional(),
  is_available: z.boolean().default(true),
  id: z.string(),
});

export const episodeSourceSchema = z.object({
  provider: z.string(),
  key: z.string(),
  title: z.string(),
  player: z.string().default("unknown"),
  external_url: z.string().nullable().optional(),
  official_url: z.string().nullable().optional(),
});

export const playbackOptionSchema = z.object({
  provider: z.string(),
  source_key: z.string(),
  source_title: z.string(),
  kind: z.enum(["hls", "mp4", "dash", "embed", "external"]),
  quality: z.number().int().default(0),
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  official_url: z.string().nullable().optional(),
});

export const libraryItemSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  anime_id: z.string(),
  status: z.enum([
    "plan_to_watch",
    "watching",
    "completed",
    "on_hold",
    "dropped",
  ]),
  progress_episode: z.number().int().default(0),
  created_at: z.string(),
  updated_at: z.string(),
  anime: animeSummarySchema.nullable().optional(),
});

export const userSchema = z.object({
  id: z.string(),
  telegram_id: z.number().int(),
  username: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  language_code: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  last_seen_at: z.string(),
});

export const providerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["catalog", "playback"]),
  enabled: z.boolean(),
  supports_search: z.boolean().default(false),
  supports_episodes: z.boolean().default(false),
  supports_playback: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int().nullable().optional(),
    has_more: z.boolean().optional(),
  });
}

export const animeSummaryPageSchema = pageSchema(animeSummarySchema);
export const animeEpisodePageSchema = pageSchema(animeEpisodeSchema);
export const libraryItemPageSchema = pageSchema(libraryItemSchema);
export const providerInfoListSchema = z.array(providerInfoSchema);
export const episodeSourceListSchema = z.array(episodeSourceSchema);
export const playbackOptionListSchema = z.array(playbackOptionSchema);
